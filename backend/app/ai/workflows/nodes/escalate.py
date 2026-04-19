"""
Escalate Node — decisão de escalação via LCEL chain + LangFuse callback.

Usa o chain LangChain (PromptTemplate | ChatOpenAI | JsonOutputParser)
com LangFuse CallbackHandler para tracing automático.
"""

import logging
from datetime import datetime
from uuid import uuid4
from typing import Any

from app.database import SessionLocal
from app.models.ai_models import AIAuditLog
from app.services.langfuse_client import get_langfuse_callback
from app.ai.chains.escalation import get_escalation_chain_with_handler


def escalate_node(state: dict[str, Any]) -> dict[str, Any]:
    """
    Node de decisão de escalação.

    Returns:
        dict com escalation_decision, escalation_needed, escalation_reason,
        assign_to, priority_override, current_node
    """
    ticket_data = state.get("ticket_data", {})
    title = ticket_data.get("title", "")
    description = ticket_data.get("description", "")
    category = state.get("category", "general")
    priority = state.get("priority", "normal")
    sentiment = state.get("sentiment", "neutral")
    execution_id = state.get("execution_id")

    chain_inputs = {
        "title": title,
        "description": description,
        "category": category,
        "priority": priority,
        "sentiment": sentiment,
    }

    db = SessionLocal()
    try:
        callback = get_langfuse_callback()

        t0 = datetime.utcnow()

        if callback:
            result = get_escalation_chain_with_handler().invoke(
                chain_inputs,
                config={"callbacks": [callback]},
            )
        else:
            result = get_escalation_chain_with_handler().invoke(chain_inputs)

        latency_ms = int((datetime.utcnow() - t0).total_seconds() * 1000)

        # Normalize result to dict
        if hasattr(result, "model_dump"):
            result = result.model_dump()
        elif not isinstance(result, dict):
            result = dict(result)

        decision = {
            "should_escalate": bool(result.get("should_escalate", False)),
            "escalation_reason": result.get("escalation_reason"),
            "assign_to": result.get("assign_to"),
            "priority_override": result.get("priority_override"),
        }

        # Audit log
        if execution_id:
            try:
                audit = AIAuditLog(
                    id=uuid4(),
                    execution_id=execution_id,
                    node_name="escalate",
                    action="node_exited",
                    actor="ai",
                    details={"decision": decision, "latency_ms": latency_ms},
                    latency_ms=latency_ms,
                )
                db.add(audit)
                db.commit()
            except Exception as e:
                logger.warning(f"[escalate_node] audit log failed: {e}")
                db.rollback()

        return {
            "escalation_decision": decision,
            "escalation_needed": decision["should_escalate"],
            "escalation_reason": decision.get("escalation_reason"),
            "assign_to": decision.get("assign_to"),
            "priority_override": decision.get("priority_override"),
            "current_node": "escalate",
        }

    except Exception as e:
        logger.error(f"[escalate_node] failed: {e}")
        decision = {
            "should_escalate": priority in ("high", "urgent"),
            "escalation_reason": None,
            "assign_to": None,
            "priority_override": None,
            "error": str(e)[:100],
        }
        return {
            "escalation_decision": decision,
            "escalation_needed": decision["should_escalate"],
            "escalation_reason": None,
            "assign_to": None,
            "priority_override": None,
            "current_node": "escalate",
        }

    finally:
        db.close()
