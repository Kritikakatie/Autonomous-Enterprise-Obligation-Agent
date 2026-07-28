"""
schemas.py — Pydantic v2 schemas for AEOA request/response validation.
"""
from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, field_validator
from models import IndemnificationScope, Tier, ContractStatus


# ── Extraction ────────────────────────────────────────────────────────────────

class ExtractionResult(BaseModel):
    vendor_name: str
    contract_start_date: str
    contract_end_date: str
    total_contract_value: float
    budget_consideration_pct: float
    time_to_default_days: int
    indemnification_scope: IndemnificationScope
    reversibility_score: float          # 0–10
    auto_renewal: bool
    governing_law: str
    key_sla_terms: str
    penalty_clauses: str
    confidence_note: Optional[str] = None


class ExtractionCorrectionRequest(BaseModel):
    vendor_name: Optional[str] = None
    contract_start_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    total_contract_value: Optional[float] = None
    budget_consideration_pct: Optional[float] = None
    time_to_default_days: Optional[int] = None
    indemnification_scope: Optional[IndemnificationScope] = None
    reversibility_score: Optional[float] = None
    auto_renewal: Optional[bool] = None
    governing_law: Optional[str] = None
    key_sla_terms: Optional[str] = None
    penalty_clauses: Optional[str] = None


# ── Scoring ───────────────────────────────────────────────────────────────────

class ScoringResult(BaseModel):
    score_budget: float
    score_reversibility: float
    score_time_to_default: float
    score_transaction_value: float
    score_indemnification: float
    composite_score: float
    tier: Tier
    confidence_pct: float
    override_amber: bool
    override_red: bool


# ── Reports ───────────────────────────────────────────────────────────────────

class SuggestionPoint(BaseModel):
    key: str            # e.g. "renewal_risk", "budget_exposure"
    label: str          # Human-readable label
    finding: str        # What was found
    recommendation: str # What to do


class SuggestionReport(BaseModel):
    risk_summary: str
    recommendations: List[SuggestionPoint]
    rationale: str


class AgentDecision(BaseModel):
    decision: str       # "ACCEPT" | "REJECT"
    justification: str


class AgentAction(BaseModel):
    action_type: str
    counterparty: str
    proposed_terms: str
    deadline: str
    channel: str
    escalation_path: str


class AmberDraftOutput(BaseModel):
    email_draft: str
    slack_draft: str
    consequence_summary: str


# ── Contracts ─────────────────────────────────────────────────────────────────

class ContractBase(BaseModel):
    filename: str
    vendor_name: Optional[str] = None
    contract_start_date: Optional[str] = None
    contract_end_date: Optional[str] = None
    total_contract_value: Optional[float] = None
    budget_consideration_pct: Optional[float] = None
    time_to_default_days: Optional[int] = None
    total_historical_transaction_value: Optional[float] = 0.0
    indemnification_scope: Optional[IndemnificationScope] = None
    reversibility_score: Optional[float] = None
    auto_renewal: Optional[bool] = None
    governing_law: Optional[str] = None
    key_sla_terms: Optional[str] = None
    penalty_clauses: Optional[str] = None


class ContractOut(ContractBase):
    id: int
    status: ContractStatus
    composite_score: Optional[float] = None
    tier: Optional[Tier] = None
    confidence_pct: Optional[float] = None
    override_amber: Optional[bool] = None
    override_red: Optional[bool] = None
    suggestion_report: Optional[Dict[str, Any]] = None
    contract_summary: Optional[str] = None
    agent_decision: Optional[str] = None
    agent_email_draft: Optional[str] = None
    agent_slack_draft: Optional[str] = None
    agent_suggested_action: Optional[Dict[str, Any]] = None
    decision_deadline: Optional[datetime] = None
    auditor_affirmed: Optional[bool] = None
    consequence_summary: Optional[str] = None
    model_version: Optional[str] = None
    created_at: datetime
    classified_at: Optional[datetime] = None
    acted_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ContractSummaryOut(BaseModel):
    id: int
    filename: str
    vendor_name: Optional[str] = None
    tier: Optional[Tier] = None
    composite_score: Optional[float] = None
    confidence_pct: Optional[float] = None
    status: ContractStatus
    contract_end_date: Optional[str] = None
    time_to_default_days: Optional[int] = None
    created_at: datetime
    classified_at: Optional[datetime] = None
    acted_at: Optional[datetime] = None
    override_amber: Optional[bool] = None
    override_red: Optional[bool] = None

    model_config = {"from_attributes": True}


# ── Feedback & Actions ────────────────────────────────────────────────────────

class GreenAffirmRequest(BaseModel):
    auditor_id: str


class GreenRevokeRequest(BaseModel):
    auditor_id: str
    flagged_suggestion_keys: List[str]
    error_types: Dict[str, str]   # key -> "Extraction Error" | "Scoring Error" | "Policy Error"


class AmberSendRequest(BaseModel):
    auditor_id: str
    final_email: str
    final_slack: str
    channel_used: str   # "Email" | "Slack" | "Teams"


class AmberRejectRequest(BaseModel):
    auditor_id: str
    parameter_affected: str
    correction_type: str    # "Extraction Error" | "Scoring Error" | "Policy Error"


class RedActionRequest(BaseModel):
    auditor_id: str
    action_type: str
    counterparty: str
    proposed_terms: str
    deadline: str
    channel: str
    escalation_path: str


class SimilarityFieldResult(BaseModel):
    field: str
    agent_value: str
    auditor_value: str
    score: float            # 0–1


class SimilarityBreakdown(BaseModel):
    fields: List[SimilarityFieldResult]
    overall_pct: float


# ── Audit Log ─────────────────────────────────────────────────────────────────

class AuditLogOut(BaseModel):
    id: int
    timestamp: datetime
    contract_id: Optional[int] = None
    user_id: Optional[str] = None
    model_version: Optional[str] = None
    action_type: str
    outcome: Optional[str] = None
    details: Optional[Dict[str, Any]] = None

    model_config = {"from_attributes": True}


# ── Notifications ─────────────────────────────────────────────────────────────

class NotificationOut(BaseModel):
    id: int
    contract_id: Optional[int] = None
    target_role: str
    tier: Optional[str] = None
    message: str
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Admin Settings ─────────────────────────────────────────────────────────────

class SystemSettingsOut(BaseModel):
    id: int
    annual_procurement_budget: float
    max_transaction_value_benchmark: float
    weight_budget_consideration: float
    weight_reversibility: float
    weight_time_to_default: float
    weight_transaction_value: float
    weight_indemnification: float
    override_time_to_default_days: int
    override_budget_pct_amber: float
    override_budget_pct_red_indemnification: float
    amber_sla_hours: int
    green_delay_hours: int

    model_config = {"from_attributes": True}


class SystemSettingsUpdate(BaseModel):
    annual_procurement_budget: Optional[float] = None
    max_transaction_value_benchmark: Optional[float] = None
    weight_budget_consideration: Optional[float] = None
    weight_reversibility: Optional[float] = None
    weight_time_to_default: Optional[float] = None
    weight_transaction_value: Optional[float] = None
    weight_indemnification: Optional[float] = None
    override_time_to_default_days: Optional[int] = None
    override_budget_pct_amber: Optional[float] = None
    override_budget_pct_red_indemnification: Optional[float] = None
    amber_sla_hours: Optional[int] = None
    green_delay_hours: Optional[int] = None

    @field_validator("weight_budget_consideration", "weight_reversibility",
                     "weight_time_to_default", "weight_transaction_value",
                     "weight_indemnification", mode="before")
    @classmethod
    def weights_positive(cls, v):
        if v is not None and v < 0:
            raise ValueError("Weight must be non-negative")
        return v


# ── Dashboard Metrics ─────────────────────────────────────────────────────────

class CorrectionRateByTier(BaseModel):
    tier: str
    total: int
    corrections: int
    rate: float


class CorrectionRateByParam(BaseModel):
    parameter: str
    count: int


class RedSimilarityTrend(BaseModel):
    date: str
    avg_similarity: float


class DashboardMetrics(BaseModel):
    correction_by_tier: List[CorrectionRateByTier]
    correction_by_parameter: List[CorrectionRateByParam]
    red_similarity_trend: List[RedSimilarityTrend]
    amber_dormancy_rate: float
    total_contracts: int
    green_count: int
    amber_count: int
    red_count: int


# ── Email Agent ───────────────────────────────────────────────────────────────

class SendEmailRequest(BaseModel):
    to_email: str
    subject: str
    body: str
    intent: str      # "confirmation" | "changes" | "rejection"


class RegenerateEmailRequest(BaseModel):
    intent: str
    extra_context: Optional[str] = ""


class VendorEmailOut(BaseModel):
    id: int
    contract_id: int
    to_email: str
    subject: str
    body: str
    intent: str
    smtp_status: str
    smtp_error: Optional[str] = None
    sent_at: datetime

    model_config = {"from_attributes": True}
