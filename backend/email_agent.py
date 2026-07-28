"""
email_agent.py — LLM-powered vendor email drafting + SMTP delivery for AEOA.

Intents:
  confirmation — accept / confirm the contract with vendor
  changes      — request specific amendments before proceeding
  rejection    — formally decline the contract

SMTP credentials are read from environment (see .env):
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
"""
import os
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import prompts
from agent import _call_llm, _extract_json


VALID_INTENTS = ("confirmation", "changes", "rejection")


# ── Draft generation ──────────────────────────────────────────────────────────

def draft_email(contract, intent: str, extra_context: str = "") -> dict:
    """
    Use LLM to draft a vendor email for the given intent.
    Returns {"subject": str, "body": str, "model_version": str}
    """
    intent = intent.lower()
    if intent not in VALID_INTENTS:
        raise ValueError(f"Invalid intent '{intent}'. Must be one of: {VALID_INTENTS}")

    report = contract.suggestion_report or {}
    risk_summary = report.get("risk_summary", "Contract reviewed by AEOA risk agent.")
    recommendations_text = "; ".join(
        r.get("recommendation", "") for r in report.get("recommendations", [])[:4]
    )
    tier = contract.tier.value if contract.tier else "Unknown"

    if intent == "confirmation":
        prompt = prompts.EMAIL_CONFIRMATION_PROMPT.format(
            vendor_name=contract.vendor_name or "Vendor",
            total_contract_value=contract.total_contract_value or 0,
            contract_start_date=contract.contract_start_date or "TBD",
            contract_end_date=contract.contract_end_date or "TBD",
            tier=tier,
            risk_summary=risk_summary,
            key_sla_terms=contract.key_sla_terms or "See contract document.",
        )
    elif intent == "changes":
        prompt = prompts.EMAIL_CHANGES_PROMPT.format(
            vendor_name=contract.vendor_name or "Vendor",
            total_contract_value=contract.total_contract_value or 0,
            contract_start_date=contract.contract_start_date or "TBD",
            contract_end_date=contract.contract_end_date or "TBD",
            tier=tier,
            risk_summary=risk_summary,
            recommendations=recommendations_text or "Please review flagged clauses.",
            extra_context=extra_context or "None provided.",
        )
    else:  # rejection
        prompt = prompts.EMAIL_REJECTION_PROMPT.format(
            vendor_name=contract.vendor_name or "Vendor",
            total_contract_value=contract.total_contract_value or 0,
            tier=tier,
            risk_summary=risk_summary,
            extra_context=extra_context or "None provided.",
        )

    raw, model_version = _call_llm(prompt)
    data = _extract_json(raw)

    return {
        "subject": data.get("subject", f"[AEOA] Re: Contract — {contract.vendor_name or 'Vendor'}"),
        "body": data.get("body", raw),
        "model_version": model_version,
    }


# ── SMTP delivery ─────────────────────────────────────────────────────────────

def _smtp_config():
    return {
        "host":      os.getenv("SMTP_HOST", ""),
        "port":      int(os.getenv("SMTP_PORT", "587")),
        "user":      os.getenv("SMTP_USER", ""),
        "password":  os.getenv("SMTP_PASS", ""),
        "from_addr": os.getenv("SMTP_FROM", os.getenv("SMTP_USER", "")),
    }


def send_email(to_email: str, subject: str, body: str) -> dict:
    """
    Send email via STARTTLS SMTP.
    Returns {"success": bool, "error": str|None}
    """
    cfg = _smtp_config()

    if not (cfg["host"] and cfg["user"] and cfg["password"]):
        return {
            "success": False,
            "error": (
                "SMTP not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS, "
                "SMTP_FROM to your .env file."
            ),
        }

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = cfg["from_addr"]
        msg["To"]      = to_email

        msg.attach(MIMEText(body, "plain"))
        html_body = (
            "<html><body>"
            "<pre style='font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap;line-height:1.6'>"
            + body.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            + "</pre></body></html>"
        )
        msg.attach(MIMEText(html_body, "html"))

        ctx = ssl.create_default_context()
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=15) as server:
            server.ehlo()
            server.starttls(context=ctx)
            server.login(cfg["user"], cfg["password"])
            server.sendmail(cfg["from_addr"], to_email, msg.as_string())

        return {"success": True, "error": None}

    except smtplib.SMTPAuthenticationError:
        return {"success": False, "error": "SMTP authentication failed. Check SMTP_USER / SMTP_PASS."}
    except smtplib.SMTPConnectError:
        return {"success": False, "error": f"Cannot connect to SMTP server {cfg['host']}:{cfg['port']}."}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
