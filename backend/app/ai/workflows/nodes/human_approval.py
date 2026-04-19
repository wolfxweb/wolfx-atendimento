"""
Human Approval Node — cria AIApproval, notifica Telegram e pausa workflow.

Este nó é o ponto de interrupt do LangGraph. Quando chega aqui,
o grafo faz interrupt_before e fica à espera que o humano aprove/rejeite
via POST /api/v1/ai/approvals/:id/approve|reject.

O thread_id é guardado no checkpoint para permitir resume.
"""
from typing import Any
from uuid import UUID, uuid4
from datetime import datetime, timedelta
from langgraph.types import interrupt
from app.database import SessionLocal
from app.models.ai_models import AIApproval, AIWorkflowExecution


TELEGRAM_BOT_TOKEN = "8312031269:AAFto1ZfqRbj3e4mWYEBsV4KgaJ7GLGgVJ8"
TELEGRAM_CHAT_ID = "1229273513"


def _notify_telegram(message: str):
    """Envia notificação para o Telegram do agente."""
    import httpx
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        httpx.post(url, json={"chat_id": TELEGRAM_CHAT_ID, "text": message}, timeout=10)
    except Exception:
        pass   # não falha o workflow por causa do telegram


def human_approval_node(state: dict[str, Any]) -> dict[str, Any]:
    """
    Nó de aprovação humana.

    1. Cria AIApproval no banco
    2. Actualiza AIWorkflowExecution status → 'awaiting_approval'
    3. Actualiza Ticket ai_processing_status → 'awaiting_approval'
    4. Notifica agente via Telegram
    5. INVOCA interrupt() — LangGraph pausa aqui

    O interrupt() retorna um Command(Resume) quando o humano responde.
    O valor de resume contém {decision, notes, approver_id}.
    """
    ticket_data = state.get("ticket_data", {})
    ticket_id = ticket_data.get("id") or state.get("ticket_id")
    execution_id = state.get("execution_id")
    classification = state.get("classification", {})
    suggested_response = state.get("suggested_response", {})
    approval_reasons = state.get("approval_reasons", [])
    approval_type = state.get("approval_type", "classify_confirm")

    db = SessionLocal()
    try:
        # 1. Criar AIApproval
        approval = AIApproval(
            id=uuid4(),
            execution_id=execution_id,
            ticket_id=ticket_id,
            approval_type=approval_type,
            step_description=f"IA sugere: {classification.get('summary', '')[:200]}",
            ai_suggestion={
                "classification": classification,
                "suggested_response": suggested_response,
                "reasons": approval_reasons,
            },
            confidence=classification.get("confidence"),
            ticket_priority=classification.get("priority"),
            ticket_category=classification.get("category"),
            dry_run=state.get("dry_run", True),
            expires_at=datetime.utcnow() + timedelta(hours=24),
        )
        db.add(approval)
        db.flush()

        # 2. Actualizar execution
        db.execute(
            AIWorkflowExecution.__table__.update()
            .where(AIWorkflowExecution.id == execution_id)
            .values(
                status="awaiting_approval",
                current_node="human_approval",
                interrupted_at=datetime.utcnow(),
            )
        )

        # 3. Notificar Telegram
        priority = classification.get("priority", "normal")
        summary = classification.get("summary", "")[:100]
        msg = (
            f"⚠️ Aprovação IA pendente\n"
            f"Ticket #{str(ticket_id)[:8]}\n"
            f"Prioridade: {priority}\n"
            f"Sugestão: {summary}\n"
            f"Razões: {', '.join(approval_reasons[:3])}\n"
            f"confirmação requerida."
        )
        _notify_telegram(msg)

        db.commit()

        # ── INTERRUPT: LangGraph pausa aqui ─────────────────────────
        # O valor returned por interrupt() fica disponível no resume.
        # Aguarda POST /api/v1/ai/approvals/:id/approve|reject
        result = interrupt(
            {
                "approval_id": str(approval.id),
                "ticket_id": str(ticket_id),
                "approval_type": approval_type,
                "message": "Aguarda aprovação humana",
            }
        )

        # ── RESUME: humano aprovou/rejeitou ─────────────────────────
        # result vem do Command passed to graph.invoke(..., resume=...)
        if isinstance(result, dict):
            decision = result.get("decision")
            notes = result.get("notes", "")
            approver_id = result.get("approver_id")

            # Atualizar AIApproval com decisão
            db.query(AIApproval).filter(AIApproval.id == approval.id).update({
                "human_decision": decision,
                "human_notes": notes,
                "approver_user_id": approver_id,
                "approved_at": datetime.utcnow(),
            })
            db.commit()

            return {
                "human_decision": decision,
                "human_notes": notes,
                "approver_id": approver_id,
                "approval_id": approval.id,
                "pending_approval": False,
                "current_node": "human_approval",
            }

        return {
            "human_decision": None,
            "current_node": "human_approval",
        }

    except Exception as e:
        db.rollback()
        return {
            "error_message": f"human_approval error: {str(e)[:200]}",
            "current_node": "human_approval",
        }
    finally:
        db.close()
