from datetime import datetime, timedelta
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DbSession

from database import get_db
import models

SESSION_COOKIE_NAME = "serveiq_session"
TOKEN_EXPIRE_MINUTES = 180   # session lifetime; name kept for guest_cleanup's cutoff math

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(pw: str) -> str:
    return pwd_ctx.hash(pw)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


def create_session(user_id: str, db: DbSession) -> models.Session:
    """Create and persist a new session row for `user_id`. Returns the row so
    the caller can read its `id` (the opaque token to put in the cookie) and
    `expires_at` (to set the cookie's max_age)."""
    session = models.Session(
        user_id=user_id,
        expires_at=datetime.utcnow() + timedelta(minutes=TOKEN_EXPIRE_MINUTES),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def delete_session(session_id: str, db: DbSession):
    db.query(models.Session).filter(models.Session.id == session_id).delete()
    db.commit()


def get_current_user(request: Request, db: DbSession = Depends(get_db)) -> models.User:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired session",
    )
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    if not session_id:
        raise cred_exc

    session = (
        db.query(models.Session)
        .filter(models.Session.id == session_id, models.Session.expires_at > datetime.utcnow())
        .first()
    )
    if not session:
        raise cred_exc
    return session.user
