"""
main.py — FastAPI application entry point for AEOA.
All routes: upload, contracts, notifications, audit log, admin settings, WebSocket.
"""
import asyncio
import json
import os
from datetime import datetime
from typing import List, Optional
from pathlib import Path

from fastapi import (
    FastAPI, File, UploadFile, HTTPException, Depends,
    Query, BackgroundTasks, WebSocket, WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from models import (
    create_tables, get_db, Contract, AuditLog, Notification,
    SystemSettings, ContractStatus, Tier,
)
from schemas import (
    ContractOut, ContractSummaryOut, ExtractionCorrectionRequest,
    GreenAffirmRequest, GreenRevokeRequest, AmberSendRequest, AmberRejectRequest,
    RedActionRequest, SimilarityBreakdown, AuditLogOut, NotificationOut,
    SystemSettingsOut, SystemSettingsUpdate, DashboardMetrics,
)
from audit import log_event, EVT_UPLOAD, EVT_AUDITOR_ACTION, EVT_FEEDBACK, EVT_AFFIRM, EVT_REVOKE, EVT_AMBER_SEND, EVT_AMBER_REJECT, EVT_RED_ACTION
from feedback import (
    store_green_feedback, store_amber_diff, store_amber_feedback,
    compute_red_similarity, store_red_action, get_dashboard_metrics,
)
from scheduler import start_scheduler, stop_scheduler
import agent as agent_module

# ── App Setup ─────────────────────────────────────────────────────────────────

app = FastAPI(title="AEOA — Autonomous Enterprise Obligation Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Load .env
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")


@app.on_event("startup")
async def startup():
    create_tables()
    _seed_default_settings()
    start_scheduler(check_interval_minutes=5)


@app.on_event("shutdown")
async def shutdown():
    stop_scheduler()


def _seed_default_settings():
    from models import SessionLocal
    db = SessionLocal()
    try:
        if not db.query(SystemSettings).first():
            db.add(SystemSettings())
            db.commit()
    finally:
        db.close()


# ── WebSocket Notification Manager ───────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        dead = []
        for ws in self.active_connections:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active_connections.remove(ws)


manager = ConnectionManager()


@app.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep-alive ping
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ── Mock Auth ─────────────────────────────────────────────────────────────────

def get_current_user(role: str = Query(default="agent_auditor")) -> str:
    """Mock auth: pass ?role=agent_auditor or ?role=manager as query param."""
    if role not in ("agent_auditor", "manager"):
        raise HTTPException(status_code=400, detail="Invalid role. Use 'agent_auditor' or 'manager'.")
    return role


# ── Text Extraction Helpers ───────────────────────────────────────────────────

async def _extract_text(file_path: Path, filename: str) -> str:
    """Extract text from PDF or DOCX."""
    ext = filename.lower().split(".")[-1]
    if ext == "pdf":
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(str(file_path))
            return "\n".join(page.get_text() for page in doc)
        except ImportError:
            try:
                import pdfplumber
                with pdfplumber.open(str(file_path)) as pdf:
                    return "\n".join(p.extract_text() or "" for p in pdf.pages)
            except ImportError:
                return f"[PDF text extraction unavailable. Install PyMuPDF or pdfplumber. Filename: {filename}]"
    elif ext in ("docx", "doc"):
        try:
            import docx
            doc = docx.Document(str(file_path))
            return "\n".join(para.text for para in doc.paragraphs)
        except ImportError:
            return f"[DOCX text extraction unavailable. Install python-docx. Filename: {filename}]"
    else:
        return f"[Unsupported file type: {ext}]"


# ── Contract Upload ───────────────────────────────────────────────────────────

@app.post("/upload")
async def upload_contract(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user),
):
    """Upload a contract file (PDF/DOCX), trigger agent workflow in background."""
    filename = file.filename
    if not filename.lower().endswith((".pdf", ".docx", ".doc")):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are accepted.")

    file_path = UPLOAD_DIR / filename
    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    # Create contract record
    s = db.query(SystemSettings).first()
    annual_budget = s.annual_procurement_budget if s else 10_000_000.0

    contract = Contract(
        filename=filename,
        upload_path=str(file_path),
        status=ContractStatus.uploading,
    )
    db.add(contract)
    db.commit()
    db.refresh(contract)

    log_event(db, EVT_UPLOAD, contract_id=contract.id, user_id=role,
              details={"filename": filename, "size_bytes": len(contents)})

    # Run agent in background
    background_tasks.add_task(
        _run_agent_background, contract.id, file_path, filename, annual_budget
    )

    return {"contract_id": contract.id, "status": "processing", "filename": filename}


def _run_agent_background(contract_id: int, file_path: Path, filename: str, annual_budget: float):
    """Run agent workflow in a thread (FastAPI background task)."""
    import asyncio
    from models import SessionLocal
    db = SessionLocal()
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        contract_text = loop.run_until_complete(_extract_text(file_path, filename))
        loop.run_until_complete(
            agent_module.run_agent(contract_id, contract_text, db, annual_budget)
        )
    except Exception as e:
        print(f"[Agent Background] Error for contract {contract_id}: {e}")
        import traceback; traceback.print_exc()
    finally:
        db.close()


# ── Contracts ─────────────────────────────────────────────────────────────────

@app.get("/contracts", response_model=List[ContractSummaryOut])
def list_contracts(
    tier: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Contract)
    if tier:
        q = q.filter(Contract.tier == Tier(tier))
    if status:
        q = q.filter(Contract.status == ContractStatus(status))
    return q.order_by(Contract.created_at.desc()).all()


@app.get("/contracts/{contract_id}", response_model=ContractOut)
def get_contract(contract_id: int, db: Session = Depends(get_db)):
    c = db.get(Contract, contract_id)
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")
    return c


@app.patch("/contracts/{contract_id}/extraction")
def update_extraction(
    contract_id: int,
    correction: ExtractionCorrectionRequest,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user),
):
    """Auditor manually corrects extracted fields."""
    c = db.get(Contract, contract_id)
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")
    if c.status not in (ContractStatus.extracted, ContractStatus.scored):
        raise HTTPException(status_code=400, detail="Contract not in editable state")

    update_data = correction.model_dump(exclude_none=True)
    for key, value in update_data.items():
        setattr(c, key, value)
    db.commit()

    log_event(db, EVT_AUDITOR_ACTION, contract_id=contract_id, user_id=role,
              outcome="extraction_corrected", details=update_data)
    return {"status": "updated", "fields": list(update_data.keys())}


@app.post("/contracts/{contract_id}/confirm-extraction")
def confirm_extraction(
    contract_id: int,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user),
):
    """Confirm extraction and trigger scoring."""
    from scoring import compute_parameter_scores, compute_composite_score, get_settings
    from classifier import apply_hard_overrides, classify_tier, compute_confidence, get_override_settings
    from models import IndemnificationScope as IS

    c = db.get(Contract, contract_id)
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")

    settings = get_settings(db)
    param_scores = compute_parameter_scores(
        budget_pct=c.budget_consideration_pct or 0,
        reversibility_score=c.reversibility_score or 5,
        time_to_default_days=c.time_to_default_days or 365,
        total_historical_txn=c.total_historical_transaction_value or 0,
        indemnification_scope=c.indemnification_scope or IS.none,
        settings=settings,
    )
    composite = compute_composite_score(param_scores)
    override_settings = get_override_settings(db)
    override_amber, override_red = apply_hard_overrides(
        composite_score=composite,
        time_to_default_days=c.time_to_default_days or 365,
        budget_consideration_pct=c.budget_consideration_pct or 0,
        indemnification_scope=c.indemnification_scope or IS.none,
        settings=override_settings,
    )
    tier = classify_tier(composite, override_amber, override_red)
    confidence = compute_confidence(composite, tier)

    c.score_budget = param_scores["score_budget"]
    c.score_reversibility = param_scores["score_reversibility"]
    c.score_time_to_default = param_scores["score_time_to_default"]
    c.score_transaction_value = param_scores["score_transaction_value"]
    c.score_indemnification = param_scores["score_indemnification"]
    c.composite_score = composite
    c.tier = tier
    c.override_amber = override_amber
    c.override_red = override_red
    c.confidence_pct = confidence
    c.classified_at = datetime.utcnow()
    c.status = ContractStatus.scored
    db.commit()

    return {"status": "scored", "composite_score": composite, "tier": tier.value}


# ── Green Tier Actions ────────────────────────────────────────────────────────

@app.post("/contracts/{contract_id}/affirm")
def affirm_decision(
    contract_id: int,
    body: GreenAffirmRequest,
    db: Session = Depends(get_db),
):
    c = db.get(Contract, contract_id)
    if not c or c.tier != Tier.green:
        raise HTTPException(status_code=404, detail="Green contract not found")

    c.auditor_affirmed = True
    c.status = ContractStatus.action_taken
    c.acted_at = datetime.utcnow()
    db.commit()

    log_event(db, EVT_AFFIRM, contract_id=contract_id, user_id=body.auditor_id,
              model_version=c.model_version, outcome="affirmed",
              details={"decision": c.agent_decision})
    return {"status": "affirmed", "decision": c.agent_decision}


@app.post("/contracts/{contract_id}/revoke")
def revoke_decision(
    contract_id: int,
    body: GreenRevokeRequest,
    db: Session = Depends(get_db),
):
    c = db.get(Contract, contract_id)
    if not c or c.tier != Tier.green:
        raise HTTPException(status_code=404, detail="Green contract not found")

    c.auditor_affirmed = False
    c.status = ContractStatus.action_taken
    c.acted_at = datetime.utcnow()
    db.commit()

    store_green_feedback(db, contract_id, body.auditor_id,
                         body.flagged_suggestion_keys, body.error_types, c.model_version)
    log_event(db, EVT_REVOKE, contract_id=contract_id, user_id=body.auditor_id,
              model_version=c.model_version, outcome="revoked",
              details={"flagged_keys": body.flagged_suggestion_keys, "error_types": body.error_types})
    return {"status": "revoked"}


# ── Amber Tier Actions ────────────────────────────────────────────────────────

@app.post("/contracts/{contract_id}/amber-send")
def amber_send(
    contract_id: int,
    body: AmberSendRequest,
    db: Session = Depends(get_db),
):
    c = db.get(Contract, contract_id)
    if not c or c.tier != Tier.amber:
        raise HTTPException(status_code=404, detail="Amber contract not found")

    c.sent_email = body.final_email
    c.sent_slack = body.final_slack
    c.amber_channel = body.channel_used
    c.status = ContractStatus.action_taken
    c.acted_at = datetime.utcnow()
    db.commit()

    store_amber_diff(
        db, contract_id,
        ai_email=c.agent_email_draft or "",
        ai_slack=c.agent_slack_draft or "",
        final_email=body.final_email,
        final_slack=body.final_slack,
        channel_used=body.channel_used,
    )
    log_event(db, EVT_AMBER_SEND, contract_id=contract_id, user_id=body.auditor_id,
              model_version=c.model_version, outcome="sent",
              details={"channel": body.channel_used})
    return {"status": "sent", "channel": body.channel_used}


@app.post("/contracts/{contract_id}/amber-reject")
def amber_reject(
    contract_id: int,
    body: AmberRejectRequest,
    db: Session = Depends(get_db),
):
    c = db.get(Contract, contract_id)
    if not c or c.tier != Tier.amber:
        raise HTTPException(status_code=404, detail="Amber contract not found")

    c.status = ContractStatus.action_taken
    c.acted_at = datetime.utcnow()
    db.commit()

    store_amber_feedback(db, contract_id, body.auditor_id,
                         body.parameter_affected, body.correction_type, c.model_version)
    log_event(db, EVT_AMBER_REJECT, contract_id=contract_id, user_id=body.auditor_id,
              model_version=c.model_version, outcome="rejected",
              details={"parameter": body.parameter_affected, "error_type": body.correction_type})
    return {"status": "rejected"}


# ── Red Tier Actions ──────────────────────────────────────────────────────────

@app.post("/contracts/{contract_id}/red-action")
def red_action(
    contract_id: int,
    body: RedActionRequest,
    db: Session = Depends(get_db),
):
    c = db.get(Contract, contract_id)
    if not c or c.tier != Tier.red:
        raise HTTPException(status_code=404, detail="Red contract not found")

    agent_action = c.agent_suggested_action or {}
    auditor_action = body.model_dump(exclude={"auditor_id"})

    similarity = compute_red_similarity(agent_action, auditor_action)
    store_red_action(db, contract_id, agent_action, auditor_action, similarity)

    c.status = ContractStatus.action_taken
    c.acted_at = datetime.utcnow()
    db.commit()

    log_event(db, EVT_RED_ACTION, contract_id=contract_id, user_id=body.auditor_id,
              model_version=c.model_version, outcome="submitted",
              details={"overall_similarity": similarity.overall_pct, "action_type": body.action_type})

    return {
        "status": "submitted",
        "similarity": similarity.model_dump(),
    }


# ── Notifications ─────────────────────────────────────────────────────────────

@app.get("/notifications", response_model=List[NotificationOut])
def list_notifications(
    role: str = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Notification)
        .filter(Notification.target_role == role)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )


@app.patch("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, db: Session = Depends(get_db)):
    n = db.get(Notification, notification_id)
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    db.commit()
    return {"status": "read"}


# ── Audit Log ─────────────────────────────────────────────────────────────────

@app.get("/audit-log", response_model=List[AuditLogOut])
def get_audit_log(
    contract_id: Optional[int] = None,
    tier: Optional[str] = None,
    action_type: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(AuditLog)
    if contract_id:
        q = q.filter(AuditLog.contract_id == contract_id)
    if action_type:
        q = q.filter(AuditLog.action_type == action_type)
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)
    if date_from:
        try:
            q = q.filter(AuditLog.timestamp >= datetime.fromisoformat(date_from))
        except Exception:
            pass
    if date_to:
        try:
            q = q.filter(AuditLog.timestamp <= datetime.fromisoformat(date_to))
        except Exception:
            pass
    if tier:
        # Join with contract to filter by tier
        q = q.join(Contract, AuditLog.contract_id == Contract.id, isouter=True)\
              .filter(Contract.tier == Tier(tier))

    return q.order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit).all()


# ── Admin Settings ─────────────────────────────────────────────────────────────

@app.get("/admin/settings", response_model=SystemSettingsOut)
def get_settings_endpoint(db: Session = Depends(get_db)):
    s = db.query(SystemSettings).first()
    if not s:
        s = SystemSettings()
        db.add(s); db.commit(); db.refresh(s)
    return s


@app.put("/admin/settings", response_model=SystemSettingsOut)
def update_settings(
    body: SystemSettingsUpdate,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user),
):
    s = db.query(SystemSettings).first()
    if not s:
        s = SystemSettings()
        db.add(s)

    update_data = body.model_dump(exclude_none=True)

    # Validate weights sum to 1.0 if any weight is provided
    weight_keys = ["weight_budget_consideration", "weight_reversibility",
                   "weight_time_to_default", "weight_transaction_value", "weight_indemnification"]
    new_weights = {k: update_data.get(k, getattr(s, k)) for k in weight_keys}
    weight_sum = sum(new_weights.values())
    if abs(weight_sum - 1.0) > 0.001:
        raise HTTPException(
            status_code=400,
            detail=f"Scoring weights must sum to 1.0 (100%). Current sum: {weight_sum:.3f}"
        )

    for key, value in update_data.items():
        setattr(s, key, value)
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)

    log_event(db, "admin_settings_updated", user_id=role, details=update_data)
    return s


# ── Admin Dashboard Metrics ────────────────────────────────────────────────────

@app.get("/admin/dashboard", response_model=DashboardMetrics)
def admin_dashboard(db: Session = Depends(get_db)):
    return get_dashboard_metrics(db)


# ── Email Agent ───────────────────────────────────────────────────────────────

from email_agent import draft_email, send_email as smtp_send
from schemas import SendEmailRequest, RegenerateEmailRequest, VendorEmailOut
from models import VendorEmail


@app.post("/contracts/{contract_id}/email/regenerate")
def regenerate_email_draft(
    contract_id: int,
    body: RegenerateEmailRequest,
    db: Session = Depends(get_db),
):
    """LLM re-drafts a vendor email for the given intent. Does NOT send or store."""
    c = db.get(Contract, contract_id)
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")
    try:
        result = draft_email(c, body.intent, body.extra_context or "")
        return {"subject": result["subject"], "body": result["body"], "model_version": result["model_version"]}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM draft failed: {e}")


@app.post("/contracts/{contract_id}/email/send")
def send_vendor_email(
    contract_id: int,
    body: SendEmailRequest,
    db: Session = Depends(get_db),
    role: str = Depends(get_current_user),
):
    """Send an email to the vendor via SMTP and record it in DB."""
    c = db.get(Contract, contract_id)
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")

    result = smtp_send(body.to_email, body.subject, body.body)

    record = VendorEmail(
        contract_id=contract_id,
        to_email=body.to_email,
        subject=body.subject,
        body=body.body,
        intent=body.intent,
        smtp_status="sent" if result["success"] else "failed",
        smtp_error=result.get("error"),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    log_event(
        db, "email_sent",
        contract_id=contract_id, user_id=role,
        outcome="sent" if result["success"] else "failed",
        details={
            "to": body.to_email, "intent": body.intent,
            "smtp_error": result.get("error"),
        },
    )

    if result["success"]:
        return {"status": "sent", "email_id": record.id}
    else:
        return {"status": "failed", "error": result["error"], "email_id": record.id}


@app.get("/contracts/{contract_id}/email/history", response_model=List[VendorEmailOut])
def get_email_history(contract_id: int, db: Session = Depends(get_db)):
    """Return all vendor emails sent for this contract, newest first."""
    c = db.get(Contract, contract_id)
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")
    return (
        db.query(VendorEmail)
        .filter(VendorEmail.contract_id == contract_id)
        .order_by(VendorEmail.sent_at.desc())
        .all()
    )
