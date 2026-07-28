"""
config.py — Configurable thresholds and system settings for AEOA.
These are the defaults; DB-backed SystemSettings table can override them at runtime.
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── LLM ──────────────────────────────────────────────
    groq_api_key: str = ""
    gemini_api_key: str = ""
    primary_model: str = "llama-3.1-70b-versatile"  # Groq model
    fallback_model: str = "gemini-2.5-flash-preview-05-20"  # Google GenAI SDK

    # ── Financial benchmarks ──────────────────────────────
    annual_procurement_budget: float = 10_000_000.0  # USD
    max_transaction_value_benchmark: float = 5_000_000.0  # USD

    # ── Scoring weights (must sum to 1.0) ─────────────────
    weight_budget_consideration: float = 0.25
    weight_reversibility: float = 0.20
    weight_time_to_default: float = 0.20
    weight_transaction_value: float = 0.20
    weight_indemnification: float = 0.15

    # ── Hard override thresholds ──────────────────────────
    override_time_to_default_days: int = 7          # force Amber if < this
    override_budget_pct_amber: float = 80.0         # force Amber if > this %
    override_budget_pct_red_indemnification: float = 50.0  # force Red if indemnification unfavorable AND budget > this %

    # ── SLA windows ───────────────────────────────────────
    amber_sla_hours: int = 48          # hours before dormancy escalation
    green_delay_hours: int = 4         # hours before auto-execution
    scheduler_check_minutes: int = 30  # how often APScheduler runs Amber check

    # ── Tier thresholds ───────────────────────────────────
    green_max_score: float = 39.0
    amber_max_score: float = 69.0

    model_config = {"env_file": "../../.env", "extra": "ignore"}


settings = Settings()
