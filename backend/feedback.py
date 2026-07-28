"""
feedback.py — Correction storage, amber diff tracking, and Red similarity scoring.
"""
import difflib
from datetime import datetime, date
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from models import (
    Contract, Correction, AmberDraft, RedAction,
    AuditLog, Tier, SystemSettings,
)
from schemas import (
    SimilarityBreakdown, SimilarityFieldResult,
    CorrectionRateByTier, CorrectionRateByParam,
    RedSimilarityTrend, DashboardMetrics,
)


# ── Green Feedback ────────────────────────────────────────────────────────────

def store_green_feedback(
    db: Session,
    contract_id: int,
    auditor_id: str,
    flagged_suggestion_keys: List[str],
    error_types: Dict[str, str],
    model_version: Optional[str],
):
    contract = db.get(Contract, contract_id)
    correction = Correction(
        contract_id=contract_id,
        tier=Tier.green,
        correction_type="Mixed",
        parameter_affected="suggestion",
        suggestions_flagged={
            "keys": flagged_suggestion_keys,
            "error_types": error_types,
        },
        model_version=model_version,
        auditor_id=auditor_id,
    )
    db.add(correction)
    db.commit()


# ── Amber Feedback ────────────────────────────────────────────────────────────

def store_amber_diff(
    db: Session,
    contract_id: int,
    ai_email: str,
    ai_slack: str,
    final_email: str,
    final_slack: str,
    channel_used: str,
) -> AmberDraft:
    email_diff = _compute_diff(ai_email, final_email)
    slack_diff = _compute_diff(ai_slack, final_slack)

    draft = AmberDraft(
        contract_id=contract_id,
        ai_email=ai_email,
        ai_slack=ai_slack,
        final_email=final_email,
        final_slack=final_slack,
        email_diff=email_diff,
        slack_diff=slack_diff,
        channel_used=channel_used,
        sent_at=datetime.utcnow(),
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return draft


def store_amber_feedback(
    db: Session,
    contract_id: int,
    auditor_id: str,
    parameter_affected: str,
    correction_type: str,
    model_version: Optional[str],
):
    correction = Correction(
        contract_id=contract_id,
        tier=Tier.amber,
        correction_type=correction_type,
        parameter_affected=parameter_affected,
        suggestions_flagged={},
        model_version=model_version,
        auditor_id=auditor_id,
    )
    db.add(correction)
    db.commit()


def _compute_diff(original: str, revised: str) -> str:
    """Character-level diff stored as unified diff string."""
    original_lines = original.splitlines(keepends=True)
    revised_lines = revised.splitlines(keepends=True)
    diff = difflib.unified_diff(original_lines, revised_lines, lineterm="")
    return "".join(diff)


# ── Red Similarity ────────────────────────────────────────────────────────────

_CATEGORICAL_FIELDS = {"action_type", "channel", "escalation_path"}


def compute_red_similarity(
    agent_action: Dict[str, Any],
    auditor_action: Dict[str, Any],
) -> SimilarityBreakdown:
    """
    Per-field similarity scoring:
    - Categorical fields: exact match = 1.0, else 0.0
    - Text fields: sequence matcher ratio
    """
    fields = ["action_type", "counterparty", "proposed_terms", "deadline", "channel", "escalation_path"]
    results: List[SimilarityFieldResult] = []

    for field in fields:
        agent_val = str(agent_action.get(field, "")).strip()
        auditor_val = str(auditor_action.get(field, "")).strip()

        if field in _CATEGORICAL_FIELDS:
            score = 1.0 if agent_val.lower() == auditor_val.lower() else 0.0
        elif field == "deadline":
            # Date similarity: exact match or 0
            score = 1.0 if agent_val == auditor_val else 0.0
        else:
            score = difflib.SequenceMatcher(None, agent_val, auditor_val).ratio()

        results.append(SimilarityFieldResult(
            field=field,
            agent_value=agent_val,
            auditor_value=auditor_val,
            score=round(score, 3),
        ))

    overall = round(sum(r.score for r in results) / len(results) * 100, 1) if results else 0.0
    return SimilarityBreakdown(fields=results, overall_pct=overall)


def store_red_action(
    db: Session,
    contract_id: int,
    agent_action: Dict[str, Any],
    auditor_action: Dict[str, Any],
    similarity: SimilarityBreakdown,
) -> RedAction:
    action = RedAction(
        contract_id=contract_id,
        agent_action_type=agent_action.get("action_type", ""),
        agent_counterparty=agent_action.get("counterparty", ""),
        agent_proposed_terms=agent_action.get("proposed_terms", ""),
        agent_deadline=agent_action.get("deadline", ""),
        agent_channel=agent_action.get("channel", ""),
        agent_escalation_path=agent_action.get("escalation_path", ""),
        auditor_action_type=auditor_action.get("action_type", ""),
        auditor_counterparty=auditor_action.get("counterparty", ""),
        auditor_proposed_terms=auditor_action.get("proposed_terms", ""),
        auditor_deadline=auditor_action.get("deadline", ""),
        auditor_channel=auditor_action.get("channel", ""),
        auditor_escalation_path=auditor_action.get("escalation_path", ""),
        similarity_per_field=[f.model_dump() for f in similarity.fields],
        overall_similarity_pct=similarity.overall_pct,
    )
    db.add(action)
    db.commit()
    db.refresh(action)
    return action


# ── Dashboard Metrics ─────────────────────────────────────────────────────────

def get_dashboard_metrics(db: Session) -> DashboardMetrics:
    from models import Contract as ContractModel
    all_contracts = db.query(ContractModel).all()
    total = len(all_contracts)
    green_count = sum(1 for c in all_contracts if c.tier and c.tier.value == "Green")
    amber_count = sum(1 for c in all_contracts if c.tier and c.tier.value == "Amber")
    red_count = sum(1 for c in all_contracts if c.tier and c.tier.value == "Red")

    # Correction rates by tier
    all_corrections = db.query(Correction).all()
    tier_stats: Dict[str, Dict] = {"Green": {"total": green_count, "corrections": 0},
                                    "Amber": {"total": amber_count, "corrections": 0},
                                    "Red": {"total": red_count, "corrections": 0}}
    for c in all_corrections:
        if c.tier:
            tier_stats[c.tier.value]["corrections"] += 1

    correction_by_tier = [
        CorrectionRateByTier(
            tier=t,
            total=v["total"],
            corrections=v["corrections"],
            rate=round(v["corrections"] / v["total"] * 100, 1) if v["total"] > 0 else 0.0,
        )
        for t, v in tier_stats.items()
    ]

    # Correction rates by parameter
    param_counts: Dict[str, int] = {}
    for c in all_corrections:
        p = c.parameter_affected or "unknown"
        param_counts[p] = param_counts.get(p, 0) + 1
    correction_by_parameter = [
        CorrectionRateByParam(parameter=p, count=cnt)
        for p, cnt in sorted(param_counts.items(), key=lambda x: -x[1])
    ]

    # Red similarity trend (by day)
    red_actions = db.query(RedAction).all()
    trend_by_day: Dict[str, List[float]] = {}
    for ra in red_actions:
        day = ra.submitted_at.strftime("%Y-%m-%d") if ra.submitted_at else "unknown"
        trend_by_day.setdefault(day, []).append(ra.overall_similarity_pct or 0.0)
    red_similarity_trend = [
        RedSimilarityTrend(date=d, avg_similarity=round(sum(v) / len(v), 1))
        for d, v in sorted(trend_by_day.items())
    ]

    # Amber dormancy rate
    from models import ContractStatus
    dormant = sum(1 for c in all_contracts if c.tier and c.tier.value == "Amber" and c.status == ContractStatus.dormant)
    amber_dormancy_rate = round(dormant / amber_count * 100, 1) if amber_count > 0 else 0.0

    return DashboardMetrics(
        correction_by_tier=correction_by_tier,
        correction_by_parameter=correction_by_parameter,
        red_similarity_trend=red_similarity_trend,
        amber_dormancy_rate=amber_dormancy_rate,
        total_contracts=total,
        green_count=green_count,
        amber_count=amber_count,
        red_count=red_count,
    )
