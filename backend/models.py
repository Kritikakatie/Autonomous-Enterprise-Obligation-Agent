"""
models.py — SQLAlchemy ORM models for AEOA.
"""
from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Boolean,
    DateTime, Text, JSON, ForeignKey, Enum as SAEnum
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
import enum

DATABASE_URL = "sqlite:///./aeoa.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class IndemnificationScope(str, enum.Enum):
    none = "None"
    mutual = "Mutual"
    unilateral_favorable = "Unilateral - Favorable"
    unilateral_unfavorable = "Unilateral - Unfavorable"


class Tier(str, enum.Enum):
    green = "Green"
    amber = "Amber"
    red = "Red"


class ContractStatus(str, enum.Enum):
    uploading = "Uploading"
    extracting = "Extracting"
    extracted = "Extracted"
    scoring = "Scoring"
    scored = "Scored"
    awaiting_action = "Awaiting Action"
    action_taken = "Action Taken"
    dormant = "Dormant"
    completed = "Completed"


class Contract(Base):
    __tablename__ = "contracts"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    upload_path = Column(String, nullable=False)
    status = Column(SAEnum(ContractStatus), default=ContractStatus.uploading)

    # Extracted fields
    vendor_name = Column(String)
    contract_start_date = Column(String)
    contract_end_date = Column(String)
    total_contract_value = Column(Float)
    budget_consideration_pct = Column(Float)      # as % of annual budget
    time_to_default_days = Column(Integer)
    total_historical_transaction_value = Column(Float, default=0.0)
    indemnification_scope = Column(SAEnum(IndemnificationScope))
    reversibility_score = Column(Float)            # 0–10
    auto_renewal = Column(Boolean)
    governing_law = Column(String)
    key_sla_terms = Column(Text)
    penalty_clauses = Column(Text)

    # Scoring
    score_budget = Column(Float)
    score_reversibility = Column(Float)
    score_time_to_default = Column(Float)
    score_transaction_value = Column(Float)
    score_indemnification = Column(Float)
    composite_score = Column(Float)
    tier = Column(SAEnum(Tier))
    confidence_pct = Column(Float)  # distance from nearest boundary
    override_amber = Column(Boolean, default=False)
    override_red = Column(Boolean, default=False)

    # LLM outputs
    suggestion_report = Column(JSON)    # structured report
    contract_summary = Column(Text)
    agent_decision = Column(String)     # ACCEPT / REJECT (Green)
    agent_email_draft = Column(Text)    # Amber
    agent_slack_draft = Column(Text)    # Amber
    agent_suggested_action = Column(JSON)  # Red

    # Green tier
    decision_deadline = Column(DateTime)    # execute after this
    auditor_affirmed = Column(Boolean)

    # Amber tier
    sent_email = Column(Text)
    sent_slack = Column(Text)
    amber_channel = Column(String)
    consequence_summary = Column(Text)

    model_version = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    classified_at = Column(DateTime)
    acted_at = Column(DateTime)

    # Relationships
    audit_logs = relationship("AuditLog", back_populates="contract")
    corrections = relationship("Correction", back_populates="contract")
    notifications = relationship("Notification", back_populates="contract")
    amber_drafts = relationship("AmberDraft", back_populates="contract")
    red_actions = relationship("RedAction", back_populates="contract")
    vendor_emails = relationship("VendorEmail", back_populates="contract")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    # APPEND-ONLY — never update or delete rows

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    contract_id = Column(Integer, ForeignKey("contracts.id"))
    user_id = Column(String)         # "system" for agent actions
    model_version = Column(String)
    action_type = Column(String, nullable=False)   # see audit.py for event types
    outcome = Column(String)
    details = Column(JSON)

    contract = relationship("Contract", back_populates="audit_logs")


class Correction(Base):
    __tablename__ = "corrections"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"))
    tier = Column(SAEnum(Tier))
    correction_type = Column(String)     # Extraction / Scoring / Policy
    parameter_affected = Column(String)
    suggestions_flagged = Column(JSON)   # Green: list of flagged suggestion keys
    model_version = Column(String)
    auditor_id = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)

    contract = relationship("Contract", back_populates="corrections")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"))
    target_role = Column(String)     # "agent_auditor" | "manager"
    tier = Column(String, nullable=True)  # "Green" | "Amber" | "Red"
    message = Column(Text)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    contract = relationship("Contract", back_populates="notifications")


class AmberDraft(Base):
    __tablename__ = "amber_drafts"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"))
    ai_email = Column(Text)
    ai_slack = Column(Text)
    final_email = Column(Text)
    final_slack = Column(Text)
    email_diff = Column(Text)    # character-level diff
    slack_diff = Column(Text)
    channel_used = Column(String)
    sent_at = Column(DateTime)

    contract = relationship("Contract", back_populates="amber_drafts")


class RedAction(Base):
    __tablename__ = "red_actions"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"))
    # Agent's suggested action
    agent_action_type = Column(String)
    agent_counterparty = Column(String)
    agent_proposed_terms = Column(Text)
    agent_deadline = Column(String)
    agent_channel = Column(String)
    agent_escalation_path = Column(String)
    # Auditor's submitted action
    auditor_action_type = Column(String)
    auditor_counterparty = Column(String)
    auditor_proposed_terms = Column(Text)
    auditor_deadline = Column(String)
    auditor_channel = Column(String)
    auditor_escalation_path = Column(String)
    # Similarity
    similarity_per_field = Column(JSON)
    overall_similarity_pct = Column(Float)
    submitted_at = Column(DateTime, default=datetime.utcnow)

    contract = relationship("Contract", back_populates="red_actions")


class VendorEmail(Base):
    """Tracks every email sent to a vendor from AEOA."""
    __tablename__ = "vendor_emails"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    to_email = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    intent = Column(String, nullable=False)  # "confirmation" | "changes" | "rejection"
    smtp_status = Column(String, default="pending")  # "sent" | "failed"
    smtp_error = Column(Text)
    sent_at = Column(DateTime, default=datetime.utcnow)

    contract = relationship("Contract", back_populates="vendor_emails")


class SystemSettings(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, default=1)
    annual_procurement_budget = Column(Float, default=10_000_000.0)
    max_transaction_value_benchmark = Column(Float, default=5_000_000.0)
    weight_budget_consideration = Column(Float, default=0.25)
    weight_reversibility = Column(Float, default=0.20)
    weight_time_to_default = Column(Float, default=0.20)
    weight_transaction_value = Column(Float, default=0.20)
    weight_indemnification = Column(Float, default=0.15)
    override_time_to_default_days = Column(Integer, default=7)
    override_budget_pct_amber = Column(Float, default=80.0)
    override_budget_pct_red_indemnification = Column(Float, default=50.0)
    amber_sla_hours = Column(Integer, default=48)
    green_delay_hours = Column(Integer, default=4)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


def create_tables():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
