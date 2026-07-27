from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from auth_utils import hash_password, verify_password, create_token, get_current_user
from rate_limit import check_rate_limit, record_attempt, record_failure, record_success, check_ip_flood

router = APIRouter()

MIN_PASSWORD_LENGTH = 8


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/register", response_model=schemas.TokenResponse)
def register(body: schemas.UserRegister, request: Request, db: Session = Depends(get_db)):
    # Registration doesn't have a "wrong password" concept to brute-force,
    # so it only gets the generic per-IP flood guard (blocks mass account
    # creation / email-enumeration spam), not the per-account lockout.
    check_ip_flood(_client_ip(request))
    record_attempt(_client_ip(request))

    if len(body.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
        )

    if db.query(models.User).filter(models.User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(
        email=body.email,
        name=body.name,
        hashed_pw=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return schemas.TokenResponse(
        access_token=create_token(user.id),
        user_id=user.id,
        name=user.name,
    )


@router.post("/login", response_model=schemas.TokenResponse)
def login(body: schemas.UserLogin, request: Request, db: Session = Depends(get_db)):
    client_ip = _client_ip(request)

    # Checked BEFORE the password is verified — an active account lockout
    # or IP flood block can't be bypassed by a correct password.
    check_rate_limit(client_ip, body.email)
    record_attempt(client_ip)

    user = db.query(models.User).filter(models.User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_pw):
        record_failure(body.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    record_success(body.email)
    return schemas.TokenResponse(
        access_token=create_token(user.id),
        user_id=user.id,
        name=user.name,
    )


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user