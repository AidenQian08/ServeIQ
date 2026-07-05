import math, random
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from auth_utils import get_current_user

router = APIRouter()

LOCS = ["Wide", "Body", "T"]


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=schemas.PointOut)
def add_point(
    body: schemas.PointCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    # verify session belongs to user
    session = db.query(models.MatchSession).filter(
        models.MatchSession.id == body.session_id,
        models.MatchSession.user_id == user.id,
    ).first()
    if not session:
        raise HTTPException(404, "Session not found")

    pt = models.Point(**body.model_dump())
    db.add(pt)
    db.commit()
    db.refresh(pt)
    return pt


@router.get("/session/{session_id}", response_model=list[schemas.PointOut])
def get_points(
    session_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    session = db.query(models.MatchSession).filter(
        models.MatchSession.id == session_id,
        models.MatchSession.user_id == user.id,
    ).first()
    if not session:
        raise HTTPException(404, "Session not found")

    return (
        db.query(models.Point)
        .filter(models.Point.session_id == session_id)
        .order_by(models.Point.created_at.desc())
        .all()
    )


@router.delete("/{point_id}")
def delete_point(
    point_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    pt = db.query(models.Point).join(models.MatchSession).filter(
        models.Point.id == point_id,
        models.MatchSession.user_id == user.id,
    ).first()
    if not pt:
        raise HTTPException(404, "Point not found")
    db.delete(pt)
    db.commit()
    return {"ok": True}


# ── Stats & AI ───────────────────────────────────────────────────────────────

@router.get("/session/{session_id}/stats", response_model=schemas.SessionStats)
def get_stats(
    session_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    session = db.query(models.MatchSession).filter(
        models.MatchSession.id == session_id,
        models.MatchSession.user_id == user.id,
    ).first()
    if not session:
        raise HTTPException(404, "Session not found")

    points = (
        db.query(models.Point)
        .filter(models.Point.session_id == session_id)
        .order_by(models.Point.created_at.desc())
        .all()
    )

    return _build_stats(points)


# ── Stats engine ─────────────────────────────────────────────────────────────

def _build_stats(points: list[models.Point]) -> schemas.SessionStats:
    total   = len(points)
    won     = sum(1 for p in points if p.result == "win")
    f1_att  = sum(1 for p in points)                         # every point has a 1st serve
    f1_in   = sum(1 for p in points if p.s1_in)
    s2_att  = sum(1 for p in points if not p.s1_in)
    s2_in   = sum(1 for p in points if not p.s1_in and p.s2_in)
    s2_won  = sum(1 for p in points if p.serve_num == 2 and p.result == "win" and not p.is_df)
    s2_pts  = sum(1 for p in points if p.serve_num == 2)

    deuce_pts = [p for p in points if p.side == "deuce"]
    ad_pts    = [p for p in points if p.side == "ad"]

    return schemas.SessionStats(
        total_points=total,
        points_won=won,
        win_pct=_pct(won, total),
        first_in_pct=_pct(f1_in, f1_att),
        second_in_pct=_pct(s2_in, s2_att),
        second_serve_win_pct=_pct(s2_won, s2_pts),
        deuce=_side_stats(deuce_pts),
        ad=_side_stats(ad_pts),
    )


def _side_stats(points: list[models.Point]) -> schemas.SideStats:
    first  = _loc_stats(points, serve_num=1)
    second = _loc_stats(points, serve_num=2)
    streak = _streak(points)
    rec, conf = _recommend(first, streak)
    return schemas.SideStats(
        first_serve=first,
        second_serve=second,
        streak=streak,
        recommendation=rec,
        confidence=conf,
    )


def _loc_stats(points: list[models.Point], serve_num: int) -> list[schemas.LocStat]:
    """Aggregate raw counts per location then run Thompson Sampling."""
    raw: dict[str, dict] = {
        l: {"in_att": 0, "in_made": 0, "win_att": 0, "wins": 0} for l in LOCS
    }

    if serve_num == 1:
        for p in points:
            loc = p.s1_loc
            raw[loc]["in_att"]  += 1
            if p.s1_in:
                raw[loc]["in_made"] += 1
                raw[loc]["win_att"] += 1
                if p.result == "win" and p.serve_num == 1:
                    raw[loc]["wins"] += 1
    else:
        for p in points:
            if not p.s1_in and p.s2_loc:
                loc = p.s2_loc
                raw[loc]["in_att"] += 1
                if p.s2_in:
                    raw[loc]["in_made"] += 1
                    raw[loc]["win_att"] += 1
                    if p.result == "win":
                        raw[loc]["wins"] += 1

    # Thompson probabilities
    ai_probs = _thompson(raw)

    stats = []
    for loc in LOCS:
        r = raw[loc]
        win_pct = _pct(r["wins"], r["win_att"])
        in_pct  = _pct(r["in_made"], r["in_att"])
        eff     = (win_pct / 100 * in_pct / 100 * 100) if (win_pct and in_pct) else None
        stats.append(schemas.LocStat(
            loc=loc,
            in_att=r["in_att"],
            in_made=r["in_made"],
            in_pct=in_pct,
            win_att=r["win_att"],
            wins=r["wins"],
            win_pct=win_pct,
            eff_pct=round(eff, 1) if eff else None,
            ai_prob=round(ai_probs[loc], 3),
        ))
    return stats


def _thompson(raw: dict, n_samples: int = 3000) -> dict[str, float]:
    counts = {l: 0 for l in LOCS}
    for _ in range(n_samples):
        best, bv = None, -1.0
        for loc in LOCS:
            r  = raw[loc]
            wr = _beta_sample(r["wins"] + 1, (r["win_att"] - r["wins"]) + 1)
            ir = _beta_sample(r["in_made"] + 1, (r["in_att"] - r["in_made"]) + 1)
            ev = wr * ir
            if ev > bv:
                bv, best = ev, loc
        counts[best] += 1
    return {l: counts[l] / n_samples for l in LOCS}


def _streak(points: list[models.Point]) -> dict:
    """Recent 1st-serve streak for this side and compute penalty."""
    locs = [p.s1_loc for p in points]
    if not locs:
        return {"loc": None, "count": 0, "penalty": 0.0}
    top, n = locs[0], 0
    for l in locs:
        if l == top:
            n += 1
        else:
            break
    pen = min(0.78, 1 - math.exp(-0.65 * (n - 1.2))) if n >= 2 else 0.0
    return {"loc": top, "count": n, "penalty": round(pen, 3)}


def _recommend(loc_stats: list[schemas.LocStat], streak: dict) -> tuple[str, str]:
    """Pick best loc after applying streak penalty to Thompson probs."""
    total = sum(ls.in_att for ls in loc_stats)
    if total < 3:
        return "—", "Learning"

    # Re-weight probs by streak penalty
    adj: dict[str, float] = {}
    for ls in loc_stats:
        p = ls.ai_prob
        if ls.loc == streak.get("loc") and streak.get("penalty", 0) > 0:
            p *= (1 - streak["penalty"])
        adj[ls.loc] = p

    best = max(adj, key=adj.get)
    prob = adj[best] / sum(adj.values()) if sum(adj.values()) > 0 else 0

    if total < 5:   conf = "Learning"
    elif prob >= 0.6: conf = "High"
    elif prob >= 0.38: conf = "Medium"
    else:             conf = "Low"

    return best, conf


# ── maths helpers ────────────────────────────────────────────────────────────

def _pct(num: int, den: int) -> float | None:
    return round(100 * num / den, 1) if den else None


def _beta_sample(a: float, b: float) -> float:
    return _gamma(a) / (_gamma(a) + _gamma(b))


def _gamma(shape: float) -> float:
    if shape < 1:
        return _gamma(1 + shape) * (random.random() ** (1 / shape))
    d, c = shape - 1 / 3, 1 / math.sqrt(9 * (shape - 1 / 3))
    while True:
        x = _randn()
        v = 1 + c * x
        if v <= 0:
            continue
        v = v ** 3
        u = random.random()
        if u < 1 - 0.0331 * x ** 4:
            return d * v
        if math.log(u) < 0.5 * x ** 2 + d * (1 - v + math.log(v)):
            return d * v


def _randn() -> float:
    u, v = 0.0, 0.0
    while not u:
        u = random.random()
    while not v:
        v = random.random()
    return math.sqrt(-2 * math.log(u)) * math.cos(2 * math.pi * v)
