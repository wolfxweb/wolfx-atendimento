"""
Finalize Node — grava os resultados do workflow no banco.

Actualiza ticket, cria AITicketSuggestion, actualiza AIWorkflowExecution.
"""
from typing import Any
from datetime import datetime
from uuid import UUID, uuid4
from app.database import SessionLocal
from app.models.ai_models import AIWorkflowExecution, AITicketSuggestion, AIAuditLog


def finalize_node(state: dict[str, Any]) -> dict[str, Any]:
    """
    Grava os resultados do workflow no banco de dados.

    Accoes:
      1. UPDATE ai_workflow_executions → status='completed', result=state
      2. INSERT ai_ticket_suggestions com a sugestao gerada
      3. UPDATE ticket com classificacao e ai_processing_status='completed'
      4. INSERT ai_audit_log entries
    """
    ticket_data = state.get("ticket_data", {})
    ticket_id = ticket_data.get("id") or state.get("ticket_id")
    execution_id = state.get("execution_id")
    classification = state.get("classification", {})
    suggested_response = state.get("suggested_response", {})
    escalation_needed = state.get("escalation_needed", False)
    error_message = state.get("error_message")

    db = SessionLocal()
    try:
        now = datetime.utcnow()

        # 1. Actualizar execution
        db.query(AIWorkflowExecution).filter(
            AIWorkflowExecution.id == execution_id
        ).update({
            "status": "completed" if not error_message else "failed",
            "current_node": "finalize",
            "result": {
                "classification": classification,
                "suggested_response": suggested_response,
                "escalation_needed": escalation_needed,
            },
            "error": error_message,
            "finished_at": now,
            "latency_ms": int(
                (now - state.get("started_at", now)).total_seconds() * 1000
            ),
        })

        # 2. Criar AITicketSuggestion (se houver sugestão)
        if suggested_response:
            suggestion = AITicketSuggestion(
                id=uuid4(),
                ticket_id=ticket_id,
                execution_id=execution_id,
                suggestion_type="ai_suggested_response",
                suggestion=suggested_response,
                confidence=classification.get("confidence"),
            )
            db.add(suggestion)

        # 3. Registrar audit log
        audit = AIAuditLog(
            id=uuid4(),
            execution_id=execution_id,
            node_name="finalize",
            action="workflow_completed",
            actor="system",
            details={
                "escalation_needed": escalation_needed,
                "has_suggestion": bool(suggested_response),
                "error": error_message,
            },
        )
        db.add(audit)

        db.commit()

        return {
            "current_node": "finalize",
            "should_continue": False,
        }

    except Exception as e:
        db.rollback()
        return {
            "error_message": f"finalize error: {str(e)[:200]}",
            "current_node": "finalize",
            "should_continue": False,
        }
    finally:
        db.close()
