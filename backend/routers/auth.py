from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from auth_utils import hash_password, verify_password, create_token, get_current_user
from rate_limit import rate_limit

router = APIRouter()

MIN_PASSWORD_LENGTH = 8


@router.post(
    "/register",
    response_model=schemas.TokenResponse,
    dependencies=[Depends(rate_limit(max_attempts=5, window_seconds=60))],
)
def register(body: schemas.UserRegister, db: Session = Depends(get_db)):
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


@router.post(
    "/login",
    response_model=schemas.TokenResponse,
    dependencies=[Depends(rate_limit(max_attempts=5, window_seconds=60))],
)
def login(body: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_pw):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return schemas.TokenResponse(
        access_token=create_token(user.id),
        user_id=user.id,
        name=user.name,
    )


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user
