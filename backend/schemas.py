from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


# ── Auth ──────────────────────────────────────────────────────────────────────
class UserRegister(BaseModel):
    email: EmailStr
    name: str
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    name: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Matches ───────────────────────────────────────────────────────────────────
class MatchCreate(BaseModel):
    label: str
    surface: Optional[str] = None
    player1_name: str = "Me"
    player2_name: str = "Opponent"
    format: str = "bo3"                  # "bo3" | "bo5"
    final_set_tiebreak: bool = True


class MatchOut(BaseModel):
    id: str
    label: str
    surface: Optional[str]
    player1_name: str
    player2_name: str
    format: str
    final_set_tiebreak: bool
    created_at: datetime
    is_active: bool

    p1_sets: int
    p2_sets: int
    cur_p1_games: int
    cur_p2_games: int
    cur_p1_pts: int
    cur_p2_pts: int
    sets_history: list[dict]

    server: str
    next_side: str
    is_tiebreak: bool
    game_score_display: str
    set_score_display: str
    sets_score_display: str

    is_complete: bool
    winner: Optional[str]

    point_count: int = 0


# ── Points ────────────────────────────────────────────────────────────────────
class PointCreate(BaseModel):
    match_id: str
    s1_loc: str                          # "Wide" | "Body" | "T"
    s1_in: bool
    s2_loc: Optional[str] = None
    s2_in: Optional[bool] = None
    outcome: str                         # ace | winner | unforced_error | forced_error | double_fault
    winner: str                          # "player1" | "player2" — who won the point


class PointOut(BaseModel):
    id: str
    match_id: str
    seq: int
    created_at: datetime

    set_num: int
    game_num: int
    is_tiebreak: bool

    server: str
    side: str

    s1_loc: str
    s1_in: bool
    s2_loc: Optional[str]
    s2_in: Optional[bool]

    outcome: str
    winner: str

    game_score_display: str
    set_score_display: str
    sets_score_display: str

    game_point_for: Optional[str]
    set_point_for: Optional[str]
    match_point_for: Optional[str]

    game_won: bool
    set_won: bool
    match_won: bool

    class Config:
        from_attributes = True


class AddPointResponse(BaseModel):
    point: PointOut
    match: MatchOut


# ── Stats & AI ──────────────────────────────────────────────────────────────
class LocStat(BaseModel):
    loc: str
    first_in_att: int
    first_in_made: int
    first_in_pct: Optional[float]

    first_win_att: int          # points where the 1st serve landed in at this loc
    first_wins: int
    first_win_pct: Optional[float]

    second_win_att: int         # points where the 1st serve at this loc missed
    second_wins: int
    second_win_pct: Optional[float]

    ev_pct: Optional[float]     # blended expected point-win % from aiming here
    ai_prob: float              # Thompson-sampled probability this is the best location


class SideStats(BaseModel):
    locations: list[LocStat]
    streak: dict                # { loc, count, penalty }
    recommendation: str
    confidence: str


class PlayerServeStats(BaseModel):
    player: str
    name: str
    first_serve_pts: int
    first_in_pct: Optional[float]
    second_in_pct: Optional[float]
    aces: int
    double_faults: int
    deuce: SideStats
    ad: SideStats


class PlayerOverallStats(BaseModel):
    player: str
    name: str
    points_played: int
    points_won: int
    win_pct: Optional[float]
    winners: int
    unforced_errors: int
    forced_errors: int
    aces: int
    double_faults: int


class MatchStats(BaseModel):
    total_points: int
    sets_score_display: str
    is_complete: bool
    winner: Optional[str]

    p1_overall: PlayerOverallStats
    p2_overall: PlayerOverallStats

    p1_serve: PlayerServeStats
    p2_serve: PlayerServeStats
