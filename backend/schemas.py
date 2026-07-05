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


# ── Sessions ──────────────────────────────────────────────────────────────────
class SessionCreate(BaseModel):
    label: str
    opponent: Optional[str] = None
    surface: Optional[str] = None


class SessionOut(BaseModel):
    id: str
    label: str
    opponent: Optional[str]
    surface: Optional[str]
    created_at: datetime
    is_active: bool
    point_count: int = 0

    class Config:
        from_attributes = True


# ── Points ────────────────────────────────────────────────────────────────────
class PointCreate(BaseModel):
    session_id: str
    side: str           # "deuce" | "ad"
    s1_loc: str         # "Wide" | "Body" | "T"
    s1_in: bool
    s2_loc: Optional[str] = None
    s2_in: Optional[bool] = None
    result: str         # "win" | "loss"
    serve_num: int      # 1 | 2
    is_df: bool = False


class PointOut(BaseModel):
    id: str
    session_id: str
    created_at: datetime
    side: str
    s1_loc: str
    s1_in: bool
    s2_loc: Optional[str]
    s2_in: Optional[bool]
    result: str
    serve_num: int
    is_df: bool

    class Config:
        from_attributes = True


# ── Stats ─────────────────────────────────────────────────────────────────────
class LocStat(BaseModel):
    loc: str
    in_att: int
    in_made: int
    in_pct: Optional[float]
    win_att: int
    wins: int
    win_pct: Optional[float]
    eff_pct: Optional[float]      # win% × in%
    ai_prob: float                # Thompson probability of being best


class SideStats(BaseModel):
    first_serve: list[LocStat]
    second_serve: list[LocStat]
    streak: dict                  # { loc, count, penalty }
    recommendation: str           # best loc
    confidence: str               # High / Medium / Low / Learning


class SessionStats(BaseModel):
    total_points: int
    points_won: int
    win_pct: Optional[float]
    first_in_pct: Optional[float]
    second_in_pct: Optional[float]
    second_serve_win_pct: Optional[float]
    deuce: SideStats
    ad: SideStats
