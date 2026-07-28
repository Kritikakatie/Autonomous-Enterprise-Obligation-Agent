"""
classifier.py — Tier classification and hard override rules for AEOA.
"""
from models import Tier, IndemnificationScope, SystemSettings
from sqlalchemy.orm import Session


def get_override_settings(db: Session) -> dict:
    s = db.query(SystemSettings).first()
    if s:
        return {
            "ttd_days": s.override_time_to_default_days,
            "budget_pct_amber": s.override_budget_pct_amber,
            "budget_pct_red_indem": s.override_budget_pct_red_indemnification,
        }
    return {
        "ttd_days": 7,
        "budget_pct_amber": 80.0,
        "budget_pct_red_indem": 50.0,
    }


def apply_hard_overrides(
    composite_score: float,
    time_to_default_days: int,
    budget_consideration_pct: float,
    indemnification_scope: IndemnificationScope,
    settings: dict,
) -> tuple[bool, bool]:
    """
    Returns (override_amber, override_red).
    Hard override rules:
    1. TTD < threshold days → force_amber
    2. Budget > amber_pct% → force_amber
    3. Indemnification = Unfavorable AND Budget > red_indem_pct% → force_red
    """
    override_amber = False
    override_red = False

    if time_to_default_days < settings["ttd_days"]:
        override_amber = True

    if budget_consideration_pct > settings["budget_pct_amber"]:
        override_amber = True

    if (
        indemnification_scope == IndemnificationScope.unilateral_unfavorable
        and budget_consideration_pct > settings["budget_pct_red_indem"]
    ):
        override_red = True

    return override_amber, override_red


def classify_tier(
    composite_score: float,
    override_amber: bool,
    override_red: bool,
) -> Tier:
    """
    Tier classification:
    - Green: score 0–39 AND no overrides
    - Amber: score 40–69 OR amber override
    - Red: score 70–100 OR red override
    """
    if override_red:
        return Tier.red

    if composite_score >= 70.0:
        return Tier.red

    if override_amber or composite_score >= 40.0:
        return Tier.amber

    return Tier.green


def compute_confidence(composite_score: float, tier: Tier) -> float:
    """
    Confidence = how far the score is from the nearest tier boundary (0–100%).
    Higher confidence = score is deep in the tier's range.
    """
    if tier == Tier.green:
        # Green: 0–39. Distance from 39 boundary as % of tier width (39)
        distance = 39.0 - composite_score
        return round(min(100.0, (distance / 39.0) * 100.0), 1)

    elif tier == Tier.amber:
        # Amber: 40–69. Distance from nearest boundary
        dist_from_40 = composite_score - 40.0
        dist_from_70 = 70.0 - composite_score
        distance = min(dist_from_40, dist_from_70)
        return round(min(100.0, (distance / 15.0) * 100.0), 1)

    else:  # Red: 70–100
        distance = composite_score - 70.0
        return round(min(100.0, (distance / 30.0) * 100.0), 1)
