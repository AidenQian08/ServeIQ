from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
import secrets

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
        is_guest=user.is_guest,
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
        is_guest=user.is_guest,
    )


@router.post("/guest", response_model=schemas.TokenResponse)
def create_guest(request: Request, db: Session = Depends(get_db)):
    # Same generic per-IP flood guard as register — stops someone scripting
    # this into spamming disposable rows into the database. Guests don't
    # get the account-lockout check since there's no password to brute-force.
    check_ip_flood(_client_ip(request))
    record_attempt(_client_ip(request))

    guest = models.User(
        # Placeholder email/password — guests never log in with credentials,
        # they only ever reach their account via the JWT they're issued here.
        email=f"guest-{secrets.token_hex(8)}@guest.local",
        name="Guest",
        hashed_pw=hash_password(secrets.token_urlsafe(32)),
        is_guest=True,
    )
    db.add(guest)
    db.commit()
    db.refresh(guest)

    return schemas.TokenResponse(
        access_token=create_token(guest.id),
        user_id=guest.id,
        name=guest.name,
        is_guest=True,
    )


@router.post("/logout")
def logout(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    if user.is_guest:
        # Cascades through matches -> points, via both the ORM relationship's
        # cascade="all, delete" and the DB-level ON DELETE CASCADE on the FKs.
        db.delete(user)
        db.commit()
        return {"ok": True, "deleted": True}
    return {"ok": True, "deleted": False}


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user