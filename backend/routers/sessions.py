from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from auth_utils import get_current_user

router = APIRouter()


@router.post("", response_model=schemas.SessionOut)
def create_session(
    body: schemas.SessionCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    session = models.MatchSession(user_id=user.id, **body.model_dump())
    db.add(session)
    db.commit()
    db.refresh(session)
    return _enrich(session)


@router.get("", response_model=list[schemas.SessionOut])
def list_sessions(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    sessions = (
        db.query(models.MatchSession)
        .filter(models.MatchSession.user_id == user.id)
        .order_by(models.MatchSession.created_at.desc())
        .all()
    )
    return [_enrich(s) for s in sessions]


@router.get("/{session_id}", response_model=schemas.SessionOut)
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    s = _get_or_404(session_id, user.id, db)
    return _enrich(s)


@router.delete("/{session_id}")
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    s = _get_or_404(session_id, user.id, db)
    db.delete(s)
    db.commit()
    return {"ok": True}


# ── helpers ──────────────────────────────────────────────────────────────────
def _get_or_404(session_id: str, user_id: str, db: Session) -> models.MatchSession:
    s = db.query(models.MatchSession).filter(
        models.MatchSession.id == session_id,
        models.MatchSession.user_id == user_id,
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return s


def _enrich(s: models.MatchSession) -> schemas.SessionOut:
    return schemas.SessionOut(
        id=s.id,
        label=s.label,
        opponent=s.opponent,
        surface=s.surface,
        created_at=s.created_at,
        is_active=s.is_active,
        point_count=len(s.points),
    )
