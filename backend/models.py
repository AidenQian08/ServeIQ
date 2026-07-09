import uuid
import json
from datetime import datetime
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Enum, Text
from sqlalchemy.orm import relationship
import enum as py_enum

from database import Base


def gen_uuid():
    return str(uuid.uuid4())


# ── Enums ──────────────────────────────────────────────────────────────────

class MatchFormat(str, py_enum.Enum):
    bo3 = "bo3"     # best of 3 sets
    bo5 = "bo5"     # best of 5 sets


class PlayerEnum(str, py_enum.Enum):
    player1 = "player1"
    player2 = "player2"


class SideEnum(str, py_enum.Enum):
    deuce = "deuce"
    ad    = "ad"


class LocEnum(str, py_enum.Enum):
    wide = "Wide"
    body = "Body"
    t    = "T"


class OutcomeEnum(str, py_enum.Enum):
    ace            = "ace"
    winner         = "winner"
    unforced_error = "unforced_error"
    forced_error   = "forced_error"
    double_fault   = "double_fault"


# ── Models ─────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id         = Column(String, primary_key=True, default=gen_uuid)
    email      = Column(String, unique=True, index=True, nullable=False)
    name       = Column(String, nullable=False)
    hashed_pw  = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    matches = relationship("Match", back_populates="user", cascade="all, delete")


class Match(Base):
    """A full tennis match between two players, tracked point by point.

    The cur_*/is_tiebreak/server/sets_history/p1_sets/p2_sets fields are the
    LIVE scoreboard — they're mutated in place by scoring.TennisEngine every
    time a point is logged, so the current score is always O(1) to read.
    """
    __tablename__ = "matches"

    id           = Column(String, primary_key=True, default=gen_uuid)
    user_id      = Column(String, ForeignKey("users.id"), nullable=False)

    label        = Column(String, nullable=False)          # e.g. "vs. John – Tuesday"
    surface      = Column(String, nullable=True)            # hard / clay / grass / indoor
    player1_name = Column(String, nullable=False, default="Me")
    player2_name = Column(String, nullable=False, default="Opponent")
    format       = Column(Enum(MatchFormat), nullable=False, default=MatchFormat.bo3)
    final_set_tiebreak = Column(Boolean, default=True)      # False = play final set to 2-game lead, no breaker

    created_at   = Column(DateTime, default=datetime.utcnow)
    is_active    = Column(Boolean, default=True)

    # ── live scoreboard state ──────────────────────────────────────────────
    p1_sets      = Column(Integer, default=0)
    p2_sets      = Column(Integer, default=0)
    cur_p1_games = Column(Integer, default=0)
    cur_p2_games = Column(Integer, default=0)
    cur_p1_pts   = Column(Integer, default=0)
    cur_p2_pts   = Column(Integer, default=0)
    is_tiebreak  = Column(Boolean, default=False)
    server       = Column(Enum(PlayerEnum), default=PlayerEnum.player1)   # who serves the NEXT point/game
    sets_history = Column(Text, default="[]")   # JSON list of {"p1": g1, "p2": g2} for completed sets

    is_complete  = Column(Boolean, default=False)
    winner       = Column(Enum(PlayerEnum), nullable=True)

    user   = relationship("User", back_populates="matches")
    points = relationship(
        "Point", back_populates="match", cascade="all, delete",
        order_by="Point.seq",
    )

    def sets_history_list(self):
        return json.loads(self.sets_history or "[]")

    def set_sets_history_list(self, val):
        self.sets_history = json.dumps(val)


class Point(Base):
    __tablename__ = "points"

    id         = Column(String, primary_key=True, default=gen_uuid)
    match_id   = Column(String, ForeignKey("matches.id"), nullable=False)
    seq        = Column(Integer, nullable=False)     # 1-based order within the match
    created_at = Column(DateTime, default=datetime.utcnow)

    set_num     = Column(Integer, nullable=False)
    game_num    = Column(Integer, nullable=False)     # game number within the set
    is_tiebreak = Column(Boolean, default=False)

    server = Column(Enum(PlayerEnum), nullable=False)
    side   = Column(Enum(SideEnum), nullable=False)

    # First serve
    s1_loc = Column(Enum(LocEnum), nullable=False)
    s1_in  = Column(Boolean, nullable=False)

    # Second serve — present only if the first serve missed
    s2_loc = Column(Enum(LocEnum), nullable=True)
    s2_in  = Column(Boolean, nullable=True)

    outcome = Column(Enum(OutcomeEnum), nullable=False)
    winner  = Column(Enum(PlayerEnum), nullable=False)   # who won the point

    # score context captured BEFORE this point was played
    game_score_display = Column(String, nullable=False)   # e.g. "40-30" / "Deuce" / "Ad-P1"
    set_score_display   = Column(String, nullable=False)   # games, e.g. "3-2"
    sets_score_display  = Column(String, nullable=False)   # sets, e.g. "1-0"

    game_point_for  = Column(Enum(PlayerEnum), nullable=True)
    set_point_for   = Column(Enum(PlayerEnum), nullable=True)
    match_point_for = Column(Enum(PlayerEnum), nullable=True)

    game_won  = Column(Boolean, default=False)   # did this point end the game?
    set_won   = Column(Boolean, default=False)   # did this point end the set?
    match_won = Column(Boolean, default=False)   # did this point end the match?

    match = relationship("Match", back_populates="points")
