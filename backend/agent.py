"""
agent.py — LangGraph agent workflow for AEOA.
State graph: extract_contract → score_contract → classify_tier → generate_reports → execute_tier_action → await_feedback

Primary LLM : Groq (llama-3.3-70b-versatile)
Fallback LLM: Google GenAI SDK — gemini-2.0-flash-preview (native google-genai, not LangChain)
All LLM outputs parsed into Pydantic models before use in business logic.
"""
import json
import re
import os
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, TypedDict

from langchain_core.messages import HumanMessage
from langchain_groq import ChatGroq
from google import genai as google_genai
from langgraph.graph import StateGraph, END

from sqlalchemy.orm import Session
from models import Contract, ContractStatus, Tier, IndemnificationScope, Notification
from schemas import (
    ExtractionResult, SuggestionReport, AgentDecision,
    AgentAction, AmberDraftOutput,
)
from scoring import compute_parameter_scores, compute_composite_score, get_settings
from classifier import apply_hard_overrides, classify_tier, compute_confidence
from audit import log_event, EVT_EXTRACT, EVT_SCORE, EVT_CLASSIFY, EVT_DECIDE, EVT_NOTIFY
import prompts


GEMINI_MODEL = "gemini-2.0-flash-preview"
GROQ_MODEL   = "llama-3.3-70b-versatile"


def _call_groq(prompt: str) -> str:
    """Call Groq via LangChain. Returns response text."""
    groq_key = os.getenv("GROQ_API_KEY", "")
    if not groq_key:
        raise RuntimeError("GROQ_API_KEY not set")
    llm = ChatGroq(api_key=groq_key, model=GROQ_MODEL, temperature=0.1)
    return llm.invoke([HumanMessage(content=prompt)]).content


def _call_gemini(prompt: str) -> str:
    """Call Gemini via native google-genai SDK. Returns response text."""
    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if not gemini_key:
        raise RuntimeError("GEMINI_API_KEY not set")
    client = google_genai.Client(api_key=gemini_key)
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
    )
    return response.text


def _call_llm(prompt: str) -> tuple[str, str]:
    """Call primary LLM (Groq) with Gemini fallback. Returns (response_text, model_version)."""
    ts = datetime.utcnow().strftime('%Y%m%dT%H%M%S')
    try:
        text = _call_groq(prompt)
        return text, f"{GROQ_MODEL}@{ts}"
    except Exception as e:
        print(f"[AEOA] Groq failed: {e}. Falling back to Gemini ({GEMINI_MODEL}).")
        try:
            text = _call_gemini(prompt)
            return text, f"{GEMINI_MODEL}@{ts}"
        except Exception as e2:
            raise RuntimeError(f"Both LLMs failed: {e} | {e2}")


def _extract_json(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown code blocks."""
    # Try raw parse first
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    # Strip markdown code blocks
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except Exception:
            pass
    # Try to find JSON object in text
    match2 = re.search(r"\{[\s\S]*\}", text)
    if match2:
        try:
            return json.loads(match2.group(0))
        except Exception:
            pass
    raise ValueError(f"Could not extract JSON from LLM response: {text[:300]}")


# ── Agent State ───────────────────────────────────────────────────────────────

class AgentState(TypedDict):
    contract_id: int
    db: Any  # SQLAlchemy Session
    contract_text: str
    annual_budget: float
    model_version: Optional[str]
    extraction: Optional[dict]
    param_scores: Optional[dict]
    composite_score: Optional[float]
    tier: Optional[str]
    override_amber: bool
    override_red: bool
    confidence_pct: Optional[float]
    suggestion_report: Optional[dict]
    contract_summary: Optional[str]
    agent_decision: Optional[str]
    agent_email_draft: Optional[str]
    agent_slack_draft: Optional[str]
    consequence_summary: Optional[str]
    agent_suggested_action: Optional[dict]
    error: Optional[str]


# ── Graph Nodes ───────────────────────────────────────────────────────────────

def extract_contract(state: AgentState) -> AgentState:
    """Node 1: Extract structured fields from contract text using LLM."""
    db: Session = state["db"]
    contract_id = state["contract_id"]

    try:
        contract = db.get(Contract, contract_id)
        contract.status = ContractStatus.extracting
        db.commit()

        prompt = prompts.EXTRACT_CONTRACT_PROMPT.format(
            contract_text=state["contract_text"],
            annual_budget=state["annual_budget"],
        )
        response, model_version = _call_llm(prompt)
        raw = _extract_json(response)

        # Parse with Pydantic
        extraction = ExtractionResult(**raw)

        # Update contract in DB
        contract.vendor_name = extraction.vendor_name
        contract.contract_start_date = extraction.contract_start_date
        contract.contract_end_date = extraction.contract_end_date
        contract.total_contract_value = extraction.total_contract_value
        contract.budget_consideration_pct = extraction.budget_consideration_pct
        contract.time_to_default_days = extraction.time_to_default_days
        contract.indemnification_scope = extraction.indemnification_scope
        contract.reversibility_score = extraction.reversibility_score
        contract.auto_renewal = extraction.auto_renewal
        contract.governing_law = extraction.governing_law
        contract.key_sla_terms = extraction.key_sla_terms
        contract.penalty_clauses = extraction.penalty_clauses
        contract.model_version = model_version
        contract.status = ContractStatus.extracted
        db.commit()

        log_event(db, EVT_EXTRACT, contract_id=contract_id, model_version=model_version,
                  outcome="success", details={"vendor": extraction.vendor_name})

        return {**state, "extraction": extraction.model_dump(), "model_version": model_version, "error": None}

    except Exception as e:
        db.get(Contract, contract_id)
        log_event(db, EVT_EXTRACT, contract_id=contract_id, outcome="error", details={"error": str(e)})
        return {**state, "error": str(e)}


def score_contract(state: AgentState) -> AgentState:
    """Node 2: Compute composite risk score."""
    if state.get("error"):
        return state

    db: Session = state["db"]
    contract_id = state["contract_id"]
    extraction = state["extraction"]

    try:
        contract = db.get(Contract, contract_id)
        contract.status = ContractStatus.scoring
        db.commit()

        settings = get_settings(db)
        param_scores = compute_parameter_scores(
            budget_pct=extraction["budget_consideration_pct"],
            reversibility_score=extraction["reversibility_score"],
            time_to_default_days=extraction["time_to_default_days"],
            total_historical_txn=contract.total_historical_transaction_value or 0.0,
            indemnification_scope=IndemnificationScope(extraction["indemnification_scope"]),
            settings=settings,
        )
        composite = compute_composite_score(param_scores)

        contract.score_budget = param_scores["score_budget"]
        contract.score_reversibility = param_scores["score_reversibility"]
        contract.score_time_to_default = param_scores["score_time_to_default"]
        contract.score_transaction_value = param_scores["score_transaction_value"]
        contract.score_indemnification = param_scores["score_indemnification"]
        contract.composite_score = composite
        contract.status = ContractStatus.scored
        db.commit()

        log_event(db, EVT_SCORE, contract_id=contract_id, model_version=state["model_version"],
                  outcome="success", details={"composite_score": composite, **param_scores})

        return {**state, "param_scores": param_scores, "composite_score": composite, "error": None}

    except Exception as e:
        log_event(db, EVT_SCORE, contract_id=contract_id, outcome="error", details={"error": str(e)})
        return {**state, "error": str(e)}


def classify_tier_node(state: AgentState) -> AgentState:
    """Node 3: Apply hard overrides and classify tier."""
    if state.get("error"):
        return state

    db: Session = state["db"]
    contract_id = state["contract_id"]
    extraction = state["extraction"]

    try:
        from classifier import get_override_settings
        override_settings = get_override_settings(db)

        override_amber, override_red = apply_hard_overrides(
            composite_score=state["composite_score"],
            time_to_default_days=extraction["time_to_default_days"],
            budget_consideration_pct=extraction["budget_consideration_pct"],
            indemnification_scope=IndemnificationScope(extraction["indemnification_scope"]),
            settings=override_settings,
        )

        tier = classify_tier(state["composite_score"], override_amber, override_red)
        confidence = compute_confidence(state["composite_score"], tier)

        contract = db.get(Contract, contract_id)
        contract.tier = tier
        contract.override_amber = override_amber
        contract.override_red = override_red
        contract.confidence_pct = confidence
        contract.classified_at = datetime.utcnow()
        db.commit()

        log_event(db, EVT_CLASSIFY, contract_id=contract_id, model_version=state["model_version"],
                  outcome=tier.value, details={
                      "composite_score": state["composite_score"],
                      "override_amber": override_amber, "override_red": override_red,
                      "confidence_pct": confidence,
                  })

        return {**state, "tier": tier.value, "override_amber": override_amber,
                "override_red": override_red, "confidence_pct": confidence, "error": None}

    except Exception as e:
        log_event(db, EVT_CLASSIFY, contract_id=contract_id, outcome="error", details={"error": str(e)})
        return {**state, "error": str(e)}


def _contract_details_str(extraction: dict, composite: float) -> str:
    return (
        f"Vendor: {extraction.get('vendor_name')}\n"
        f"Value: ${extraction.get('total_contract_value', 0):,.0f}\n"
        f"Start: {extraction.get('contract_start_date')} | End: {extraction.get('contract_end_date')}\n"
        f"Budget %: {extraction.get('budget_consideration_pct')}%\n"
        f"Time to Default: {extraction.get('time_to_default_days')} days\n"
        f"Indemnification: {extraction.get('indemnification_scope')}\n"
        f"Reversibility: {extraction.get('reversibility_score')}/10\n"
        f"Auto-renewal: {extraction.get('auto_renewal')}\n"
        f"Governing Law: {extraction.get('governing_law')}\n"
        f"Key SLA Terms: {extraction.get('key_sla_terms')}\n"
        f"Penalty Clauses: {extraction.get('penalty_clauses')}\n"
        f"Composite Score: {composite}/100"
    )


def generate_reports(state: AgentState) -> AgentState:
    """Node 4: Generate LLM reports based on tier."""
    if state.get("error"):
        return state

    db: Session = state["db"]
    contract_id = state["contract_id"]
    tier = state["tier"]
    extraction = state["extraction"]
    composite = state["composite_score"]
    model_version = state["model_version"]
    contract_details = _contract_details_str(extraction, composite)
    override_flags = f"Amber: {state['override_amber']}, Red: {state['override_red']}"

    try:
        contract = db.get(Contract, contract_id)

        if tier == Tier.green.value:
            # Suggestion report
            rpt_prompt = prompts.GREEN_SUGGESTION_REPORT_PROMPT.format(
                contract_details=contract_details,
                composite_score=composite,
                budget_pct=extraction["budget_consideration_pct"],
                time_to_default=extraction["time_to_default_days"],
                reversibility=extraction["reversibility_score"],
            )
            rpt_raw, mv = _call_llm(rpt_prompt)
            rpt_data = _extract_json(rpt_raw)
            suggestion_report = SuggestionReport(**rpt_data).model_dump()

            # Decision
            dec_prompt = prompts.GREEN_DECISION_PROMPT.format(
                vendor_name=extraction["vendor_name"],
                risk_summary=rpt_data.get("risk_summary", ""),
                composite_score=composite,
                rationale=rpt_data.get("rationale", ""),
            )
            dec_raw, _ = _call_llm(dec_prompt)
            dec_data = _extract_json(dec_raw)
            agent_decision = AgentDecision(**dec_data)

            # Contract summary
            sum_prompt = prompts.GREEN_CONTRACT_SUMMARY_PROMPT.format(contract_details=contract_details)
            contract_summary, _ = _call_llm(sum_prompt)

            # Set green deadline (default 4 hours, configurable)
            from models import SystemSettings
            s = db.query(SystemSettings).first()
            delay_hours = s.green_delay_hours if s else 4
            deadline = datetime.utcnow() + timedelta(hours=delay_hours)

            contract.suggestion_report = suggestion_report
            contract.contract_summary = contract_summary
            contract.agent_decision = agent_decision.decision
            contract.decision_deadline = deadline
            contract.status = ContractStatus.awaiting_action
            db.commit()

            # Send notification to auditor
            notif = Notification(
                contract_id=contract_id,
                target_role="agent_auditor",
                tier="Green",
                message=f"Agent has made a {agent_decision.decision} decision on {extraction['vendor_name']}. Review and affirm or revoke within {delay_hours} hours.",
            )
            db.add(notif)
            db.commit()

            log_event(db, EVT_DECIDE, contract_id=contract_id, model_version=mv,
                      outcome=agent_decision.decision, details={"justification": agent_decision.justification})
            log_event(db, EVT_NOTIFY, contract_id=contract_id, model_version=mv,
                      outcome="sent", details={"role": "agent_auditor"})

            return {**state, "suggestion_report": suggestion_report,
                    "contract_summary": contract_summary,
                    "agent_decision": agent_decision.decision, "error": None}

        elif tier == Tier.amber.value:
            rpt_prompt = prompts.AMBER_SUGGESTION_REPORT_PROMPT.format(
                contract_details=contract_details, composite_score=composite, override_flags=override_flags,
            )
            rpt_raw, mv = _call_llm(rpt_prompt)
            rpt_data = _extract_json(rpt_raw)
            suggestion_report = SuggestionReport(**rpt_data).model_dump()

            # Extract recommended action from report
            recs = rpt_data.get("recommendations", [])
            recommended_action = recs[0]["recommendation"] if recs else "Review and negotiate contract terms"
            key_concerns = "; ".join(r["finding"] for r in recs[:3])

            drafts_prompt = prompts.AMBER_DRAFTS_PROMPT.format(
                vendor_name=extraction["vendor_name"],
                recommended_action=recommended_action,
                risk_summary=rpt_data.get("risk_summary", ""),
                key_concerns=key_concerns,
            )
            drafts_raw, _ = _call_llm(drafts_prompt)
            drafts_data = _extract_json(drafts_raw)
            amber_output = AmberDraftOutput(**drafts_data)

            sum_prompt = prompts.AMBER_CONTRACT_SUMMARY_PROMPT.format(contract_details=contract_details)
            contract_summary, _ = _call_llm(sum_prompt)

            contract.suggestion_report = suggestion_report
            contract.contract_summary = contract_summary
            contract.agent_email_draft = amber_output.email_draft
            contract.agent_slack_draft = amber_output.slack_draft
            contract.consequence_summary = amber_output.consequence_summary
            contract.status = ContractStatus.awaiting_action
            db.commit()

            notif = Notification(
                contract_id=contract_id,
                target_role="agent_auditor",
                tier="Amber",
                message=f"Amber-tier contract {extraction['vendor_name']} requires your review and action.",
            )
            db.add(notif)
            db.commit()

            log_event(db, EVT_NOTIFY, contract_id=contract_id, model_version=mv,
                      outcome="sent", details={"role": "agent_auditor", "tier": "Amber"})

            return {**state, "suggestion_report": suggestion_report,
                    "contract_summary": contract_summary,
                    "agent_email_draft": amber_output.email_draft,
                    "agent_slack_draft": amber_output.slack_draft,
                    "consequence_summary": amber_output.consequence_summary, "error": None}

        else:  # Red
            rpt_prompt = prompts.RED_SUGGESTION_REPORT_PROMPT.format(
                contract_details=contract_details, composite_score=composite, override_flags=override_flags,
            )
            rpt_raw, mv = _call_llm(rpt_prompt)
            rpt_data = _extract_json(rpt_raw)
            suggestion_report = SuggestionReport(**rpt_data).model_dump()

            action_prompt = prompts.RED_SUGGESTED_ACTION_PROMPT.format(
                vendor_name=extraction["vendor_name"],
                risk_summary=rpt_data.get("risk_summary", ""),
                composite_score=composite,
            )
            action_raw, _ = _call_llm(action_prompt)
            action_data = _extract_json(action_raw)
            agent_action = AgentAction(**action_data)

            sum_prompt = prompts.RED_CONTRACT_SUMMARY_PROMPT.format(contract_details=contract_details)
            contract_summary, _ = _call_llm(sum_prompt)

            contract.suggestion_report = suggestion_report
            contract.contract_summary = contract_summary
            contract.agent_suggested_action = agent_action.model_dump()
            contract.status = ContractStatus.awaiting_action
            db.commit()

            notif = Notification(
                contract_id=contract_id,
                target_role="agent_auditor",
                tier="Red",
                message=f"Red-tier HIGH RISK contract {extraction['vendor_name']} requires immediate action.",
            )
            db.add(notif)
            db.commit()

            log_event(db, EVT_NOTIFY, contract_id=contract_id, model_version=mv,
                      outcome="sent", details={"role": "agent_auditor", "tier": "Red"})

            return {**state, "suggestion_report": suggestion_report,
                    "contract_summary": contract_summary,
                    "agent_suggested_action": agent_action.model_dump(), "error": None}

    except Exception as e:
        import traceback; traceback.print_exc()
        log_event(db, "generate_reports", contract_id=contract_id, outcome="error", details={"error": str(e)})
        return {**state, "error": str(e)}


def execute_tier_action(state: AgentState) -> AgentState:
    """Node 5: Mark as ready for human action (no autonomous Red action). Green awaits deadline."""
    return state


def await_feedback(state: AgentState) -> AgentState:
    """Node 6: Contract is now in awaiting_action state. Human will act via API."""
    return state


# ── Build Graph ───────────────────────────────────────────────────────────────

def build_agent_graph():
    graph = StateGraph(AgentState)
    graph.add_node("extract_contract", extract_contract)
    graph.add_node("score_contract", score_contract)
    graph.add_node("classify_tier", classify_tier_node)
    graph.add_node("generate_reports", generate_reports)
    graph.add_node("execute_tier_action", execute_tier_action)
    graph.add_node("await_feedback", await_feedback)

    graph.set_entry_point("extract_contract")
    graph.add_edge("extract_contract", "score_contract")
    graph.add_edge("score_contract", "classify_tier")
    graph.add_edge("classify_tier", "generate_reports")
    graph.add_edge("generate_reports", "execute_tier_action")
    graph.add_edge("execute_tier_action", "await_feedback")
    graph.add_edge("await_feedback", END)

    return graph.compile()


agent_graph = build_agent_graph()


async def run_agent(
    contract_id: int,
    contract_text: str,
    db: Session,
    annual_budget: float = 10_000_000.0,
):
    """Run the full agent workflow for a contract."""
    initial_state: AgentState = {
        "contract_id": contract_id,
        "db": db,
        "contract_text": contract_text,
        "annual_budget": annual_budget,
        "model_version": None,
        "extraction": None,
        "param_scores": None,
        "composite_score": None,
        "tier": None,
        "override_amber": False,
        "override_red": False,
        "confidence_pct": None,
        "suggestion_report": None,
        "contract_summary": None,
        "agent_decision": None,
        "agent_email_draft": None,
        "agent_slack_draft": None,
        "consequence_summary": None,
        "agent_suggested_action": None,
        "error": None,
    }
    return agent_graph.invoke(initial_state)
