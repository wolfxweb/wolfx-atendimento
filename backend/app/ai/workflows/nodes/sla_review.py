"""
SLA Review Node — avalia SLA do ticket e detecta risco de breach.

Código Python puro (sem LLM).
"""
from typing import Any
from datetime import datetime, timedelta
from app.database import SessionLocal
from sqlalchemy import text


def sla_review_node(state: dict[str, Any]) -> dict[str, Any]:
    """
    Calcula o estado do SLA e detecta risco de breach.

    Returns:
        sla_status: dict com {status, time_remaining, breach_risk, sla_id, sla_name}
    """
    ticket_data = state.get("ticket_data", {})
    ticket_id = ticket_data.get("id")
    sla_id = ticket_data.get("sla_id")

    if not sla_id:
        return {
            "sla_status": {
                "status": "no_sla",
                "time_remaining": None,
                "breach_risk": False,
                "sla_id": None,
                "sla_name": None,
            },
            "current_node": "sla_review",
        }

    db = SessionLocal()
    try:
        # Ler SLA
        sla_row = db.execute(
            text("SELECT name, response_minutes, resolution_minutes FROM sla WHERE id = :sla_id"),
            {"sla_id": str(sla_id)}
        ).fetchone()

        if not sla_row:
            return {
                "sla_status": {"status": "sla_not_found", "breach_risk": False},
                "current_node": "sla_review",
            }

        sla_name, response_minutes, resolution_minutes = sla_row

        # Tempos limite do ticket
        sla_response_limit = ticket_data.get("sla_response_limit")
        sla_resolution_limit = ticket_data.get("sla_resolution_limit")

        now = datetime.utcnow()
        breach_risk = False
        status = "ok"
        time_remaining: timedelta | None = None

        # Avaliar response SLA
        if sla_response_limit:
            if isinstance(sla_response_limit, str):
                sla_response_limit = datetime.fromisoformat(sla_response_limit)
            remaining = sla_response_limit - now
            time_remaining = remaining

            if remaining.total_seconds() < 0:
                status = "breached"
                breach_risk = True
            elif remaining < timedelta(minutes=30):
                breach_risk = True

        # Avaliar resolution SLA
        if sla_resolution_limit and status != "breached":
            if isinstance(sla_resolution_limit, str):
                sla_resolution_limit = datetime.fromisoformat(sla_resolution_limit)
            remaining_res = sla_resolution_limit - now
            if time_remaining is None or remaining_res < time_remaining:
                time_remaining = remaining_res

            if remaining_res.total_seconds() < 0:
                status = "breached"
                breach_risk = True
            elif remaining_res < timedelta(minutes=30):
                breach_risk = True

        time_remaining_str = None
        if time_remaining:
            total_secs = int(time_remaining.total_seconds())
            if total_secs >= 0:
                hours, rem = divmod(total_secs, 3600)
                mins, _ = divmod(rem, 60)
                time_remaining_str = f"{hours}h {mins}m"
            else:
                time_remaining_str = "OVERDUE"

        return {
            "sla_status": {
                "status": status,
                "time_remaining": time_remaining_str,
                "breach_risk": breach_risk,
                "sla_id": str(sla_id),
                "sla_name": sla_name,
            },
            "current_node": "sla_review",
        }

    except Exception as e:
        return {
            "sla_status": {
                "status": "error",
                "breach_risk": False,
                "error": str(e)[:100],
            },
            "current_node": "sla_review",
        }
    finally:
        db.close()
