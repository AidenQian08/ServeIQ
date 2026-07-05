import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
import enum as py_enum

from database import Base


def gen_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id         = Column(String, primary_key=True, default=gen_uuid)
    email      = Column(String, unique=True, index=True, nullable=False)
    name       = Column(String, nullable=False)
    hashed_pw  = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    sessions = relationship("MatchSession", back_populates="user", cascade="all, delete")


class MatchSession(Base):
    __tablename__ = "match_sessions"

    id           = Column(String, primary_key=True, default=gen_uuid)
    user_id      = Column(String, ForeignKey("users.id"), nullable=False)
    label        = Column(String, nullable=False)          # e.g. "vs. John – Tuesday"
    opponent     = Column(String, nullable=True)
    surface      = Column(String, nullable=True)           # hard / clay / grass / indoor
    created_at   = Column(DateTime, default=datetime.utcnow)
    is_active    = Column(Boolean, default=True)

    user   = relationship("User", back_populates="sessions")
    points = relationship("Point", back_populates="session", cascade="all, delete")


class SideEnum(str, py_enum.Enum):
    deuce = "deuce"
    ad    = "ad"


class LocEnum(str, py_enum.Enum):
    wide = "Wide"
    body = "Body"
    t    = "T"


class Point(Base):
    __tablename__ = "points"

    id         = Column(String, primary_key=True, default=gen_uuid)
    session_id = Column(String, ForeignKey("match_sessions.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    side       = Column(Enum(SideEnum), nullable=False)

    # First serve
    s1_loc     = Column(Enum(LocEnum), nullable=False)
    s1_in      = Column(Boolean, nullable=False)

    # Second serve (null if 1st serve was in)
    s2_loc     = Column(Enum(LocEnum), nullable=True)
    s2_in      = Column(Boolean, nullable=True)

    # Point result & which serve decided it
    result     = Column(String, nullable=False)    # "win" | "loss"
    serve_num  = Column(Integer, nullable=False)   # 1 or 2
    is_df      = Column(Boolean, default=False)    # double fault

    session = relationship("MatchSession", back_populates="points")
