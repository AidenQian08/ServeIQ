from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from auth_utils import hash_password, verify_password, create_token, get_current_user
from rate_limit import check_lockout, record_failure, clear_failures

router = APIRouter()

MIN_PASSWORD_LENGTH = 8


@router.post("/register", response_model=schemas.TokenResponse)
def register(body: schemas.UserRegister, db: Session = Depends(get_db), rl_key: str = Depends(check_lockout)):
    if len(body.password) < MIN_PASSWORD_LENGTH:
        record_failure(rl_key, max_attempts=5, window_seconds=60, lockout_seconds=60)
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
        )

    if db.query(models.User).filter(models.User.email == body.email).first():
        record_failure(rl_key, max_attempts=5, window_seconds=60, lockout_seconds=60)
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(
        email=body.email,
        name=body.name,
        hashed_pw=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    clear_failures(rl_key)
    return schemas.TokenResponse(
        access_token=create_token(user.id),
        user_id=user.id,
        name=user.name,
    )


@router.post("/login", response_model=schemas.TokenResponse)
def login(body: schemas.UserLogin, db: Session = Depends(get_db), rl_key: str = Depends(check_lockout)):
    user = db.query(models.User).filter(models.User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_pw):
        record_failure(rl_key, max_attempts=5, window_seconds=60, lockout_seconds=60)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    clear_failures(rl_key)
    return schemas.TokenResponse(
        access_token=create_token(user.id),
        user_id=user.id,
        name=user.name,
    )


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user