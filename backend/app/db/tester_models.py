from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text, Uuid

from app.db.models import Base, now_utc


class TesterMission(Base):
    __tablename__ = "tester_missions"

    id = Column(String(64), primary_key=True)
    sample_diary = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    reason = Column(Text, nullable=True)
    helper = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=now_utc)


class TesterParticipant(Base):
    __tablename__ = "tester_participants"

    id = Column(Uuid, primary_key=True)
    mission_id = Column(ForeignKey("tester_missions.id"), nullable=False)
    invite_hash = Column(String(64), nullable=False, unique=True)
    app_user_id = Column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    analysis_started_at = Column(DateTime(timezone=True), nullable=True)
    analyzed_at = Column(DateTime(timezone=True), nullable=True)


class TesterEvaluation(Base):
    __tablename__ = "tester_evaluations"
    __table_args__ = (
        CheckConstraint("relevance BETWEEN 1 AND 5"),
        CheckConstraint("clarity BETWEEN 1 AND 5"),
        CheckConstraint("feasibility BETWEEN 1 AND 5"),
    )

    participant_id = Column(ForeignKey("tester_participants.id"), primary_key=True)
    mission_id = Column(ForeignKey("tester_missions.id"), nullable=False, index=True)
    relevance = Column(Integer, nullable=False)
    clarity = Column(Integer, nullable=False)
    feasibility = Column(Integer, nullable=False)
    comment = Column(Text, nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=False, default=now_utc)
