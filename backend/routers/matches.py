from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from auth_utils import get_current_user
from scoring import game_score_display, TennisEngine

router = APIRouter()


@router.post("", response_model=schemas.MatchOut)
def create_match(
    body: schemas.MatchCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if body.format not in ("bo3", "bo5"):
        raise HTTPException(400, "format must be 'bo3' or 'bo5'")

    match = models.Match(
        user_id=user.id,
        label=body.label,
        surface=body.surface,
        player1_name=body.player1_name,
        player2_name=body.player2_name,
        format=body.format,
        final_set_tiebreak=body.final_set_tiebreak,
    )
    db.add(match)
    db.commit()
    db.refresh(match)
    return _enrich(match)


@router.get("", response_model=list[schemas.MatchOut])
def list_matches(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    matches = (
        db.query(models.Match)
        .filter(models.Match.user_id == user.id)
        .order_by(models.Match.created_at.desc())
        .all()
    )
    return [_enrich(m) for m in matches]


@router.get("/{match_id}", response_model=schemas.MatchOut)
def get_match(
    match_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    m = _get_or_404(match_id, user.id, db)
    return _enrich(m)


@router.delete("/{match_id}")
def delete_match(
    match_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    m = _get_or_404(match_id, user.id, db)
    db.delete(m)
    db.commit()
    return {"ok": True}


# ── helpers ──────────────────────────────────────────────────────────────────
def _get_or_404(match_id: str, user_id: str, db: Session) -> models.Match:
    m = db.query(models.Match).filter(
        models.Match.id == match_id,
        models.Match.user_id == user_id,
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
    return m


def _enrich(m: models.Match) -> schemas.MatchOut:
    live_server, live_side = TennisEngine(m).next_side_and_server()
    return schemas.MatchOut(
        id=m.id,
        label=m.label,
        surface=m.surface,
        player1_name=m.player1_name,
        player2_name=m.player2_name,
        format=m.format,
        final_set_tiebreak=m.final_set_tiebreak,
        created_at=m.created_at,
        is_active=m.is_active,
        p1_sets=m.p1_sets,
        p2_sets=m.p2_sets,
        cur_p1_games=m.cur_p1_games,
        cur_p2_games=m.cur_p2_games,
        cur_p1_pts=m.cur_p1_pts,
        cur_p2_pts=m.cur_p2_pts,
        sets_history=m.sets_history_list(),
        server=live_server,
        next_side=live_side,
        is_tiebreak=m.is_tiebreak,
        game_score_display=game_score_display(m.cur_p1_pts, m.cur_p2_pts, m.is_tiebreak),
        set_score_display=f"{m.cur_p1_games}-{m.cur_p2_games}",
        sets_score_display=f"{m.p1_sets}-{m.p2_sets}",
        is_complete=m.is_complete,
        winner=m.winner,
        point_count=len(m.points),
    )
