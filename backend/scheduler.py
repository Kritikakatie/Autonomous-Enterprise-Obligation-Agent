"""
scheduler.py — APScheduler background jobs for AEOA SLA monitoring.
Checks for Amber contracts with no action taken within the configurable SLA window.
"""
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session
from models import Contract, Notification, ContractStatus, Tier, SystemSettings, SessionLocal
from audit import log_event, EVT_ESCALATE, EVT_NOTIFY

scheduler = BackgroundScheduler()


def check_amber_dormancy():
    """
    Check for Amber contracts that have been awaiting action beyond the SLA window.
    Triggered every N minutes by APScheduler.
    """
    db: Session = SessionLocal()
    try:
        # Get SLA window from settings
        s = db.query(SystemSettings).first()
        sla_hours = s.amber_sla_hours if s else 48

        cutoff = datetime.utcnow() - timedelta(hours=sla_hours)

        dormant_contracts = db.query(Contract).filter(
            Contract.tier == Tier.amber,
            Contract.status == ContractStatus.awaiting_action,
            Contract.classified_at <= cutoff,
        ).all()

        for contract in dormant_contracts:
            # Mark dormant
            contract.status = ContractStatus.dormant
            db.commit()

            # Send manager notification
            notif = Notification(
                contract_id=contract.id,
                target_role="manager",
                tier="Amber",
                message=(
                    f"⚠️ DORMANT SLA BREACH: Contract '{contract.vendor_name or contract.filename}' "
                    f"(Amber) has been awaiting action for over {sla_hours} hours. "
                    f"Immediate manager review required."
                ),
            )
            db.add(notif)
            db.commit()

            log_event(
                db,
                EVT_ESCALATE,
                contract_id=contract.id,
                user_id="system",
                outcome="dormant",
                details={
                    "sla_hours": sla_hours,
                    "classified_at": contract.classified_at.isoformat() if contract.classified_at else None,
                    "hours_elapsed": (datetime.utcnow() - contract.classified_at).total_seconds() / 3600
                    if contract.classified_at else None,
                },
            )
            log_event(db, EVT_NOTIFY, contract_id=contract.id, user_id="system",
                      outcome="manager_escalation", details={"target": "manager"})

        if dormant_contracts:
            print(f"[Scheduler] Flagged {len(dormant_contracts)} Amber contract(s) as DORMANT.")

    except Exception as e:
        print(f"[Scheduler] Error in check_amber_dormancy: {e}")
    finally:
        db.close()


def check_green_execution():
    """
    Check for Green contracts where the 4-hour delay has passed and no revocation occurred.
    Mark as completed/executed.
    """
    db: Session = SessionLocal()
    try:
        pending = db.query(Contract).filter(
            Contract.tier == Tier.green,
            Contract.status == ContractStatus.awaiting_action,
            Contract.decision_deadline <= datetime.utcnow(),
            Contract.auditor_affirmed.is_(None),  # neither affirmed nor revoked
        ).all()

        for contract in pending:
            contract.status = ContractStatus.completed
            contract.acted_at = datetime.utcnow()
            db.commit()

            notif = Notification(
                contract_id=contract.id,
                target_role="agent_auditor",
                tier="Green",
                message=(
                    f"✅ Agent decision '{contract.agent_decision}' has been auto-executed for "
                    f"'{contract.vendor_name or contract.filename}'. Review window has closed."
                ),
            )
            db.add(notif)
            db.commit()

            from audit import EVT_EXECUTE
            log_event(db, EVT_EXECUTE, contract_id=contract.id, user_id="system",
                      outcome="auto_executed", details={"decision": contract.agent_decision})

        if pending:
            print(f"[Scheduler] Auto-executed {len(pending)} Green contract(s).")

    except Exception as e:
        print(f"[Scheduler] Error in check_green_execution: {e}")
    finally:
        db.close()


def start_scheduler(check_interval_minutes: int = 5):
    """Start APScheduler with SLA monitoring jobs."""
    scheduler.add_job(
        check_amber_dormancy,
        trigger=IntervalTrigger(minutes=check_interval_minutes),
        id="amber_dormancy_check",
        replace_existing=True,
        misfire_grace_time=60,
    )
    scheduler.add_job(
        check_green_execution,
        trigger=IntervalTrigger(minutes=1),
        id="green_execution_check",
        replace_existing=True,
        misfire_grace_time=60,
    )
    scheduler.start()
    print(f"[Scheduler] Started. Amber SLA check every {check_interval_minutes} minutes. Green check every 1 minute.")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
