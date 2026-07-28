"""
scoring.py — Composite scoring engine for AEOA contract risk assessment.
"""
import math
from typing import Optional
from models import IndemnificationScope, SystemSettings
from sqlalchemy.orm import Session


def get_settings(db: Session) -> dict:
    """Get settings from DB, falling back to defaults."""
    s = db.query(SystemSettings).first()
    if s:
        return {
            "annual_budget": s.annual_procurement_budget,
            "max_txn_benchmark": s.max_transaction_value_benchmark,
            "w_budget": s.weight_budget_consideration,
            "w_rev": s.weight_reversibility,
            "w_ttd": s.weight_time_to_default,
            "w_txn": s.weight_transaction_value,
            "w_indem": s.weight_indemnification,
        }
    return {
        "annual_budget": 10_000_000.0,
        "max_txn_benchmark": 5_000_000.0,
        "w_budget": 0.25,
        "w_rev": 0.20,
        "w_ttd": 0.20,
        "w_txn": 0.20,
        "w_indem": 0.15,
    }


def score_budget_consideration(budget_pct: float, weight: float = 0.25) -> float:
    """
    Budget Consideration: % of annual procurement budget.
    0% -> 0 pts, 100% -> weight*100 pts. Linear scale.
    """
    budget_pct_clamped = max(0.0, min(100.0, budget_pct))
    raw = (budget_pct_clamped / 100.0) * 100.0  # 0–100 raw contribution
    return round(raw * weight, 4)


def score_reversibility(reversibility_score: float, weight: float = 0.20) -> float:
    """
    Reversibility is inverted: high reversibility (easy exit) = low risk = low score.
    reversibility_score 0–10 (10 = easy to exit).
    Invert: risk_rev = (10 - reversibility_score) / 10 * 100
    """
    rev_clamped = max(0.0, min(10.0, reversibility_score))
    inverted = (10.0 - rev_clamped) / 10.0 * 100.0  # 0–100
    return round(inverted * weight, 4)


def score_time_to_default(time_to_default_days: int, weight: float = 0.20) -> float:
    """
    Time to Default: exponential decay — urgency rises sharply as days < 30.
    Formula: if days <= 0: max contribution
             else: score = 100 * exp(-0.05 * max(0, days - 30)) for days < 30
                         = 100 * exp(-0.005 * max(0, days)) for days >= 30
    """
    d = max(0, time_to_default_days)
    if d == 0:
        raw = 100.0
    elif d <= 30:
        # Exponential spike: 100 at 0 days, ~22 at 30 days
        raw = 100.0 * math.exp(-0.05 * d)
    else:
        # Slower decay after 30 days: ~22 at 30 days, approaching 0 at ~500 days
        raw = 100.0 * math.exp(-0.005 * d) * math.exp(-0.05 * 30) / math.exp(-0.005 * 30)
        raw = max(0.0, raw)
    return round(raw * weight, 4)


def score_transaction_value(
    total_historical_txn: float,
    max_txn_benchmark: float,
    weight: float = 0.20,
) -> float:
    """
    Normalize total historical transaction value against the configurable max benchmark.
    0 = 0 pts, >= benchmark = full weight * 100 pts.
    """
    if max_txn_benchmark <= 0:
        return 0.0
    normalized = min(1.0, total_historical_txn / max_txn_benchmark) * 100.0
    return round(normalized * weight, 4)


def score_indemnification(
    indemnification_scope: IndemnificationScope,
    weight: float = 0.15,
) -> float:
    """
    None = 0, Mutual = 5, Unilateral Favorable = 8, Unilateral Unfavorable = 15
    Scale to weight contribution (out of weight*100).
    """
    raw_map = {
        IndemnificationScope.none: 0.0,
        IndemnificationScope.mutual: 5.0,
        IndemnificationScope.unilateral_favorable: 8.0,
        IndemnificationScope.unilateral_unfavorable: 15.0,
    }
    raw = raw_map.get(indemnification_scope, 0.0)
    # Scale: max raw is 15, representing full weight contribution
    normalized = (raw / 15.0) * 100.0
    return round(normalized * weight, 4)


def compute_parameter_scores(
    budget_pct: float,
    reversibility_score: float,
    time_to_default_days: int,
    total_historical_txn: float,
    indemnification_scope: IndemnificationScope,
    settings: dict,
) -> dict:
    """Compute all 5 parameter scores."""
    return {
        "score_budget": score_budget_consideration(budget_pct, settings["w_budget"]),
        "score_reversibility": score_reversibility(reversibility_score, settings["w_rev"]),
        "score_time_to_default": score_time_to_default(time_to_default_days, settings["w_ttd"]),
        "score_transaction_value": score_transaction_value(
            total_historical_txn, settings["max_txn_benchmark"], settings["w_txn"]
        ),
        "score_indemnification": score_indemnification(indemnification_scope, settings["w_indem"]),
    }


def compute_composite_score(param_scores: dict) -> float:
    """Sum parameter score contributions. Result is 0–100."""
    total = sum(param_scores.values())
    return round(min(100.0, max(0.0, total)), 2)
