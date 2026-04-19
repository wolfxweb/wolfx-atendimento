"""
Escalate Node — decide se deve escalar o ticket para um agente.

Usa LLM para tomar a decisão de escalação com base nas regras de negócio.
"""
from typing import Any
from datetime import datetime
from uuid import uuid4
from app.ai.chains.escalation import get_escalation_prompt
from app.services.llm_service import get_llm_service, extract_json
from app.services.langfuse_client import trace_llm_call
from app.database import SessionLocal
from app.models.ai_models import AIAuditLog


def escalate_node(state: dict[str, Any]) -> dict[str, Any]:
    """
    Node de decisão de escalação.

    Lê template 'escalation' da BD → prompt → LLM → parse JSON →
    decide se escala. O LLM é apenas o motor — as regras são Python.
    """
    ticket_data = state.get("ticket_data", {})
    title = ticket_data.get("title", "")
    description = ticket_data.get("description", "")
    category = state.get("category", "geral")
    priority = state.get("priority", "normal")
    sentiment = state.get("sentiment", "neutral")
    sla_status = state.get("sla_status", {})

    prompt = get_escalation_prompt(
        title, description, category, priority, sentiment
    )

    system_prompt = (
        "Eres un assistente AI especializado em decisões de escalação de tickets. "
        "Respondes APENAS com JSON válido, sem texto extra. "
        '{"should_escalate": true|false, "escalation_reason": "motivo ou null", '
        '"assign_to": "equipa ou null", "priority_override": "nova prioridade ou null"}'
    )

    db = SessionLocal()
    try:
        llm = get_llm_service(db)

        t0 = datetime.utcnow()
        response = llm.complete(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=0.1,
            max_tokens=256,
        )
        latency_ms = int((datetime.utcnow() - t0).total_seconds() * 1000)

        parsed = extract_json(response)

        if parsed and isinstance(parsed, dict):
            decision = {
                "should_escalate": bool(parsed.get("should_escalate", False)),
                "escalation_reason": parsed.get("escalation_reason"),
                "assign_to": parsed.get("assign_to"),
                "priority_override": parsed.get("priority_override"),
            }
        else:
            # Fallback: escala por prioridade alta
            decision = {
                "should_escalate": priority in ("high", "urgent"),
                "escalation_reason": f"Fallback: prioridade {priority}" if priority in ("high", "urgent") else None,
                "assign_to": None,
                "priority_override": None,
            }

        # Trace LangFuse
        execution_id = state.get("execution_id")
        ticket_id = ticket_data.get("id") or state.get("ticket_id")
        trace_llm_call(
            operation="escalate",
            model=llm.model,
            input_text=prompt[:500],
            output_text=response[:500],
            usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            latency_ms=latency_ms,
            execution_id=execution_id,
            ticket_id=ticket_id,
        )

        # Audit log
        if execution_id:
            try:
                audit = AIAuditLog(
                    id=uuid4(),
                    execution_id=execution_id,
                    node_name="escalate",
                    action="node_exited",
                    actor="ai",
                    details={"decision": decision},
                    latency_ms=latency_ms,
                )
                db.add(audit)
                db.commit()
            except Exception:
                db.rollback()

    except Exception as e:
        decision = {
            "should_escalate": priority in ("high", "urgent"),
            "escalation_reason": None,
            "assign_to": None,
            "priority_override": None,
            "error": str(e)[:100],
        }
    finally:
        db.close()

    return {
        "escalation_decision": decision,
        "escalation_needed": decision["should_escalate"],
        "escalation_reason": decision.get("escalation_reason"),
        "assign_to": decision.get("assign_to"),
        "current_node": "escalate",
    }
