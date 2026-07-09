import math, random
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models, schemas
from auth_utils import get_current_user
from scoring import TennisEngine, other, game_score_display
from routers.matches import _enrich as enrich_match

router = APIRouter()

LOCS = ["Wide", "Body", "T"]
SIDES = ["deuce", "ad"]


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=schemas.AddPointResponse)
def add_point(
    body: schemas.PointCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    match = db.query(models.Match).filter(
        models.Match.id == body.match_id,
        models.Match.user_id == user.id,
    ).first()
    if not match:
        raise HTTPException(404, "Match not found")
    if match.is_complete:
        raise HTTPException(400, "Match is already complete")

    if body.s1_loc not in LOCS:
        raise HTTPException(400, f"s1_loc must be one of {LOCS}")

    # ── normalize / validate the serve sequence ─────────────────────────────
    if body.s1_in:
        s2_loc, s2_in = None, None
    else:
        if body.s2_loc is None or body.s2_in is None:
            raise HTTPException(400, "s2_loc and s2_in are required when the first serve misses")
        if body.s2_loc not in LOCS:
            raise HTTPException(400, f"s2_loc must be one of {LOCS}")
        s2_loc, s2_in = body.s2_loc, body.s2_in

    serve_landed_in = bool(body.s1_in or s2_in)

    if body.outcome not in [e.value for e in models.OutcomeEnum]:
        raise HTTPException(400, "invalid outcome")
    if body.winner not in ("player1", "player2"):
        raise HTTPException(400, "winner must be 'player1' or 'player2'")

    # figure out who's actually serving this point (backend is authoritative)
    engine = TennisEngine(match)
    server, _side_preview = engine.next_side_and_server()
    returner = other(server)

    # ── outcome/winner consistency checks ───────────────────────────────────
    if not serve_landed_in:
        if body.outcome != models.OutcomeEnum.double_fault.value:
            raise HTTPException(400, "Both serves missed — outcome must be 'double_fault'")
        if body.winner != returner:
            raise HTTPException(400, "On a double fault, the point winner must be the returner")
    else:
        if body.outcome == models.OutcomeEnum.double_fault.value:
            raise HTTPException(400, "outcome can't be 'double_fault' when a serve landed in")
        if body.outcome == models.OutcomeEnum.ace.value and body.winner != server:
            raise HTTPException(400, "An ace must be won by the server")

    # ── apply to the live scoreboard ────────────────────────────────────────
    snap = engine.apply_point(body.winner)

    pt = models.Point(
        match_id=match.id,
        seq=len(match.points) + 1,
        set_num=snap["set_num"],
        game_num=snap["game_num"],
        is_tiebreak=snap["is_tiebreak"],
        server=snap["server"],
        side=snap["side"],
        s1_loc=body.s1_loc,
        s1_in=body.s1_in,
        s2_loc=s2_loc,
        s2_in=s2_in,
        outcome=body.outcome,
        winner=body.winner,
        game_score_display=snap["game_score_display"],
        set_score_display=snap["set_score_display"],
        sets_score_display=snap["sets_score_display"],
        game_point_for=snap["game_point_for"],
        set_point_for=snap["set_point_for"],
        match_point_for=snap["match_point_for"],
        game_won=snap["game_won"],
        set_won=snap["set_won"],
        match_won=snap["match_won"],
    )
    db.add(pt)
    db.add(match)
    db.commit()
    db.refresh(pt)
    db.refresh(match)

    return schemas.AddPointResponse(point=pt, match=enrich_match(match))


@router.get("/match/{match_id}", response_model=list[schemas.PointOut])
def get_points(
    match_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    match = _get_match_or_404(match_id, user.id, db)
    return (
        db.query(models.Point)
        .filter(models.Point.match_id == match.id)
        .order_by(models.Point.seq.asc())
        .all()
    )


@router.delete("/{point_id}")
def delete_point(
    point_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    pt = db.query(models.Point).join(models.Match).filter(
        models.Point.id == point_id,
        models.Match.user_id == user.id,
    ).first()
    if not pt:
        raise HTTPException(404, "Point not found")

    match = pt.match
    last_seq = db.query(models.Point).filter(models.Point.match_id == match.id).count()
    if pt.seq != last_seq:
        raise HTTPException(400, "Only the most recently logged point can be undone")

    db.delete(pt)
    db.flush()
    _rebuild_match_state(db, match)
    db.commit()
    return {"ok": True}


def _rebuild_match_state(db: Session, match: models.Match):
    """Resets the live scoreboard and replays remaining points in order.
    Used after undoing the most recent point."""
    match.p1_sets = 0
    match.p2_sets = 0
    match.cur_p1_games = 0
    match.cur_p2_games = 0
    match.cur_p1_pts = 0
    match.cur_p2_pts = 0
    match.is_tiebreak = False
    match.server = models.PlayerEnum.player1
    match.set_sets_history_list([])
    match.is_complete = False
    match.winner = None

    remaining = (
        db.query(models.Point)
        .filter(models.Point.match_id == match.id)
        .order_by(models.Point.seq.asc())
        .all()
    )
    engine = TennisEngine(match)
    for p in remaining:
        engine.apply_point(p.winner)
    db.add(match)


# ── Stats & AI ───────────────────────────────────────────────────────────────

@router.get("/match/{match_id}/stats", response_model=schemas.MatchStats)
def get_stats(
    match_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    match = _get_match_or_404(match_id, user.id, db)
    points = (
        db.query(models.Point)
        .filter(models.Point.match_id == match.id)
        .order_by(models.Point.seq.asc())
        .all()
    )
    return _build_stats(match, points)


def _get_match_or_404(match_id: str, user_id: str, db: Session) -> models.Match:
    match = db.query(models.Match).filter(
        models.Match.id == match_id,
        models.Match.user_id == user_id,
    ).first()
    if not match:
        raise HTTPException(404, "Match not found")
    return match


def _build_stats(match: models.Match, points: list) -> schemas.MatchStats:
    p1_overall = _overall_stats(points, "player1", match.player1_name)
    p2_overall = _overall_stats(points, "player2", match.player2_name)
    p1_serve = _serve_stats(points, "player1", match.player1_name)
    p2_serve = _serve_stats(points, "player2", match.player2_name)

    return schemas.MatchStats(
        total_points=len(points),
        sets_score_display=f"{match.p1_sets}-{match.p2_sets}",
        is_complete=match.is_complete,
        winner=match.winner,
        p1_overall=p1_overall,
        p2_overall=p2_overall,
        p1_serve=p1_serve,
        p2_serve=p2_serve,
    )


def _overall_stats(points: list, player: str, name: str) -> schemas.PlayerOverallStats:
    opp = other(player)
    played = len(points)
    won = sum(1 for p in points if p.winner == player)
    winners = sum(1 for p in points if p.outcome == "winner" and p.winner == player)
    unforced = sum(1 for p in points if p.outcome == "unforced_error" and p.winner == opp)
    forced = sum(1 for p in points if p.outcome == "forced_error" and p.winner == opp)
    aces = sum(1 for p in points if p.outcome == "ace" and p.server == player)
    dfs = sum(1 for p in points if p.outcome == "double_fault" and p.server == player)

    return schemas.PlayerOverallStats(
        player=player,
        name=name,
        points_played=played,
        points_won=won,
        win_pct=_pct(won, played),
        winners=winners,
        unforced_errors=unforced,
        forced_errors=forced,
        aces=aces,
        double_faults=dfs,
    )


def _serve_stats(points: list, player: str, name: str) -> schemas.PlayerServeStats:
    served = [p for p in points if p.server == player]
    first_in = sum(1 for p in served if p.s1_in)
    second_att = sum(1 for p in served if not p.s1_in)
    second_in = sum(1 for p in served if not p.s1_in and p.s2_in)
    aces = sum(1 for p in served if p.outcome == "ace")
    dfs = sum(1 for p in served if p.outcome == "double_fault")

    deuce_pts = [p for p in served if p.side == "deuce"]
    ad_pts = [p for p in served if p.side == "ad"]

    return schemas.PlayerServeStats(
        player=player,
        name=name,
        first_serve_pts=len(served),
        first_in_pct=_pct(first_in, len(served)),
        second_in_pct=_pct(second_in, second_att),
        aces=aces,
        double_faults=dfs,
        deuce=_side_stats(deuce_pts, player),
        ad=_side_stats(ad_pts, player),
    )


def _side_stats(points: list, player: str) -> schemas.SideStats:
    raw = _loc_raw(points, player)
    ai_probs = _thompson(raw)

    locs = []
    for loc in LOCS:
        r = raw[loc]
        first_in_pct = _pct(r["first_in_made"], r["first_in_att"])
        first_win_pct = _pct(r["first_wins"], r["first_win_att"])
        second_win_pct = _pct(r["second_wins"], r["second_win_att"])

        p_in = (r["first_in_att"] and r["first_in_made"] / r["first_in_att"]) or 0.0
        p_win_in = (r["first_win_att"] and r["first_wins"] / r["first_win_att"]) or 0.0
        p_win_miss = (r["second_win_att"] and r["second_wins"] / r["second_win_att"]) or 0.0
        ev = p_in * p_win_in + (1 - p_in) * p_win_miss if r["first_in_att"] else None

        locs.append(schemas.LocStat(
            loc=loc,
            first_in_att=r["first_in_att"],
            first_in_made=r["first_in_made"],
            first_in_pct=first_in_pct,
            first_win_att=r["first_win_att"],
            first_wins=r["first_wins"],
            first_win_pct=first_win_pct,
            second_win_att=r["second_win_att"],
            second_wins=r["second_wins"],
            second_win_pct=second_win_pct,
            ev_pct=round(ev * 100, 1) if ev is not None else None,
            ai_prob=round(ai_probs[loc], 3),
        ))

    streak = _streak(points)
    rec, conf = _recommend(locs, streak)
    return schemas.SideStats(locations=locs, streak=streak, recommendation=rec, confidence=conf)


def _loc_raw(points: list, player: str) -> dict:
    """Raw counts per serve location, from `player`'s point of view as server.

    first_in_att / first_in_made : how often the 1st serve aimed at `loc` landed in
    first_win_att / first_wins   : of those that landed in, how many points were won
    second_win_att / second_wins : of the 1st serves aimed at `loc` that MISSED,
                                    how many of those points were ultimately won
                                    (win rate on the fallback to the 2nd serve)
    """
    raw = {l: {"first_in_att": 0, "first_in_made": 0, "first_win_att": 0, "first_wins": 0,
               "second_win_att": 0, "second_wins": 0} for l in LOCS}
    for p in points:
        loc = p.s1_loc
        raw[loc]["first_in_att"] += 1
        if p.s1_in:
            raw[loc]["first_in_made"] += 1
            raw[loc]["first_win_att"] += 1
            if p.winner == player:
                raw[loc]["first_wins"] += 1
        else:
            raw[loc]["second_win_att"] += 1
            if p.winner == player:
                raw[loc]["second_wins"] += 1
    return raw


def _thompson(raw: dict, n_samples: int = 3000) -> dict:
    """Thompson-sample the blended EV = P(in)*P(win|in) + P(out)*P(win|out→2nd)
    for each location, and return each location's probability of being best."""
    counts = {l: 0 for l in LOCS}
    for _ in range(n_samples):
        best, bv = LOCS[0], float("-inf")   # always default to a valid location
        for loc in LOCS:
            r = raw[loc]
            p_in = _beta_sample(r["first_in_made"] + 1, (r["first_in_att"] - r["first_in_made"]) + 1)
            p_win_in = _beta_sample(r["first_wins"] + 1, (r["first_win_att"] - r["first_wins"]) + 1)
            p_win_miss = _beta_sample(r["second_wins"] + 1, (r["second_win_att"] - r["second_wins"]) + 1)
            ev = p_in * p_win_in + (1 - p_in) * p_win_miss
            if ev > bv:   # NaN comparisons are always False, so a NaN ev is simply skipped
                bv, best = ev, loc
        counts[best] += 1
    return {l: counts[l] / n_samples for l in LOCS}


def _streak(points: list) -> dict:
    """Most recent consecutive 1st-serve-location streak (for this player/side)."""
    locs = [p.s1_loc for p in reversed(points)]   # most recent first
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


def _recommend(loc_stats: list, streak: dict) -> tuple:
    total = sum(ls.first_in_att for ls in loc_stats)
    if total < 3:
        return "—", "Learning"

    adj = {}
    for ls in loc_stats:
        p = ls.ai_prob
        if ls.loc == streak.get("loc") and streak.get("penalty", 0) > 0:
            p *= (1 - streak["penalty"])
        adj[ls.loc] = p

    best = max(adj, key=adj.get)
    total_adj = sum(adj.values())
    prob = adj[best] / total_adj if total_adj > 0 else 0

    if total < 5:
        conf = "Learning"
    elif prob >= 0.6:
        conf = "High"
    elif prob >= 0.38:
        conf = "Medium"
    else:
        conf = "Low"

    return best, conf


# ── maths helpers ────────────────────────────────────────────────────────────

def _pct(num: int, den: int):
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
