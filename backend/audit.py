"""
audit.py — Append-only audit log writer for AEOA.
NEVER update or delete audit log rows.
"""
from datetime import datetime
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session
from models import AuditLog

# Event type constants
EVT_UPLOAD = "contract_uploaded"
EVT_EXTRACT = "extraction_completed"
EVT_SCORE = "score_computed"
EVT_CLASSIFY = "tier_assigned"
EVT_DECIDE = "agent_decision_made"
EVT_NOTIFY = "notification_sent"
EVT_AUDITOR_ACTION = "auditor_action_taken"
EVT_FEEDBACK = "feedback_submitted"
EVT_ESCALATE = "escalation_triggered"
EVT_EXECUTE = "action_executed"
EVT_AFFIRM = "auditor_affirmed"
EVT_REVOKE = "auditor_revoked"
EVT_AMBER_SEND = "amber_message_sent"
EVT_AMBER_REJECT = "amber_rejected"
EVT_RED_ACTION = "red_action_submitted"


def log_event(
    db: Session,
    action_type: str,
    contract_id: Optional[int] = None,
    user_id: str = "system",
    model_version: Optional[str] = None,
    outcome: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> AuditLog:
    """
    Append a new audit log entry. NEVER modifies existing rows.
    """
    entry = AuditLog(
        timestamp=datetime.utcnow(),
        contract_id=contract_id,
        user_id=user_id,
        model_version=model_version,
        action_type=action_type,
        outcome=outcome,
        details=details or {},
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
