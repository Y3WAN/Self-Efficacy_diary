from datetime import datetime, timezone
from sqlalchemy import (
    BigInteger, Boolean, Column, Date, DateTime,
    ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, relationship


def now_utc():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id = Column(BigInteger, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    initial_grade = Column(String(4), nullable=False)
    diary_count = Column(Integer, nullable=False, default=0)
    points = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)

    diaries = relationship("Diary", back_populates="user", cascade="all, delete-orphan")
    daily_analyses = relationship("DailyAnalysis", back_populates="user", cascade="all, delete-orphan")
    missions = relationship("Mission", back_populates="user", cascade="all, delete-orphan")


class Diary(Base):
    __tablename__ = "diaries"

    id = Column(BigInteger, primary_key=True)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    diary_date = Column(Date, nullable=False)
    content = Column(Text, nullable=False)
    is_locked = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now_utc)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=now_utc, onupdate=now_utc)

    user = relationship("User", back_populates="diaries")

    __table_args__ = (Index("idx_diaries_user_date", "user_id", "diary_date"),)


class DailyAnalysis(Base):
    __tablename__ = "daily_analyses"

    id = Column(BigInteger, primary_key=True)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    diary_date = Column(Date, nullable=False)
    score_m = Column(Numeric(3, 2), nullable=False)
    score_v = Column(Numeric(3, 2), nullable=False)
    score_p = Column(Numeric(3, 2), nullable=False)
    score_a = Column(Numeric(3, 2), nullable=False)
    composite_score = Column(Numeric(3, 2), nullable=True)
    confidence = Column(Numeric(3, 2), nullable=False)
    evidence_m = Column(Text, nullable=True)
    evidence_v = Column(Text, nullable=True)
    evidence_p = Column(Text, nullable=True)
    evidence_a = Column(Text, nullable=True)
    reasoning = Column(Text, nullable=True)
    is_reflected = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now_utc)

    user = relationship("User", back_populates="daily_analyses")

    __table_args__ = (
        Index("idx_analyses_user_date", "user_id", "diary_date"),
    )


class Mission(Base):
    __tablename__ = "missions"

    id = Column(BigInteger, primary_key=True)
    user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    target_var = Column(String(1), nullable=False)
    status = Column(String(10), nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), nullable=False, default=now_utc)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="missions")
    respects = relationship("Respect", back_populates="mission", cascade="all, delete-orphan")

    __table_args__ = (Index("idx_missions_user_status", "user_id", "status"),)


class Respect(Base):
    __tablename__ = "respects"

    id = Column(BigInteger, primary_key=True)
    from_user_id = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    mission_id = Column(BigInteger, ForeignKey("missions.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now_utc)

    mission = relationship("Mission", back_populates="respects")

    __table_args__ = (
        UniqueConstraint("from_user_id", "mission_id", name="uq_respect_user_mission"),
    )
