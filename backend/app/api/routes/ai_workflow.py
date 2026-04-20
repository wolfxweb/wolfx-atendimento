"""
AI Workflow API Routes - Trigger and manage AI workflow executions.

Usa o novo workflow LangGraph em app.ai.workflows.ticket_agent.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

from app.database import get_db
from sqlalchemy.orm import Session
from app.models.ai_models import AIWorkflowExecution
from app.models.models import Ticket
from app.api.routes.auth import get_current_user
from app.models.models import User

router = APIRouter(prefix="/ai/workflow", tags=["AI Workflow"])


class WorkflowRunRequest(BaseModel):
    ticket_id: UUID


class WorkflowRunResponse(BaseModel):
    execution_id: UUID
    ticket_id: UUID
    status: str
    result: dict | None = None
    error_message: str | None = None


@router.post("/run", response_model=WorkflowRunResponse)
def run_workflow(
    body: WorkflowRunRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Dispara o pipeline AI LangGraph para um ticket específico.
    Executa: classify → check_approval → rag_lookup → suggest_response → sla_review → escalate/finalize
    """
    # Verify ticket exists
    ticket = db.query(Ticket).filter(Ticket.id == body.ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Build ticket_data snapshot (evita N+1 queries nos nós)
    # Convert UUIDs to strings for JSON serialization
    def _uuid_str(v):
        return str(v) if v is not None else None

    ticket_data = {
        "id": _uuid_str(ticket.id),
        "title": ticket.title,
        "description": ticket.description,
        "status": ticket.status,
        "priority": ticket.priority,
        "category": ticket.category,
        "customer_id": _uuid_str(ticket.customer_id),
        "history": "",   # TODO: carregar histórico de comments se necessário
        "sla_id": _uuid_str(ticket.sla_id),
        "sla_response_limit": str(ticket.sla_response_limit) if ticket.sla_response_limit else None,
        "sla_resolution_limit": str(ticket.sla_resolution_limit) if ticket.sla_resolution_limit else None,
    }

    # Create execution record
    from uuid import uuid4 as uuid4_func
    thread_id = str(uuid4_func())

    execution = AIWorkflowExecution(
        ticket_id=body.ticket_id,
        workflow_name="ticket_ai_assistant",
        status="pending",
        thread_id=thread_id,
        payload={"ticket_snapshot": ticket_data},
        dry_run=True,   # fase 1: dry_run=TRUE (só monitoriza)
        started_at=datetime.utcnow(),
    )
    db.add(execution)

    # Mark ticket as pending
    ticket.ai_processing_status = "pending"
    db.commit()
    db.refresh(execution)

    try:
        from app.ai.workflows.ticket_agent import run_ticket_workflow

        # Run LangGraph workflow
        result = run_ticket_workflow(
            ticket_id=ticket.id,
            execution_id=execution.id,
            thread_id=thread_id,
            ticket_data=ticket_data,
            dry_run=True,
        )

        execution.status = "completed"
        execution.finished_at = datetime.utcnow()
        execution.result = {
            "classification": result.get("classification"),
            "suggested_response": result.get("suggested_response"),
            "escalation_needed": result.get("escalation_needed"),
            "current_node": result.get("current_node"),
        }
        execution.current_node = result.get("current_node")

        # Persist classification
        if result.get("classification"):
            _save_classification(db, ticket.id, execution.id, result["classification"])

        # Persist escalation
        if result.get("escalation_decision"):
            _save_escalation(db, ticket.id, execution.id, result)

        # Persist suggestion
        if result.get("suggested_response"):
            _save_suggestion(db, ticket.id, execution.id, result)

        # Update ticket AI fields
        ticket.ai_classification = result.get("classification")
        ticket.ai_suggested_response = result.get("suggested_response", {}).get("response")
        ticket.ai_processing_status = "completed"
        ticket.ai_last_action_at = datetime.utcnow()

        db.commit()

        return WorkflowRunResponse(
            execution_id=execution.id,
            ticket_id=ticket.id,
            status="completed",
            result=result,
        )

    except Exception as e:
        execution.status = "failed"
        execution.finished_at = datetime.utcnow()
        execution.error = str(e)
        ticket.ai_processing_status = "failed"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Workflow failed: {e}")


class WorkflowStatusResponse(BaseModel):
    execution_id: UUID
    ticket_id: UUID
    status: str
    result: dict | None
    error_message: str | None
    started_at: datetime
    finished_at: datetime | None


@router.get("/status/{execution_id}", response_model=WorkflowStatusResponse)
def get_workflow_status(
    execution_id: UUID,
    db: Session = Depends(get_db),
):
    """Retorna o estado de uma execução de workflow."""
    exec_ = db.query(AIWorkflowExecution).filter(
        AIWorkflowExecution.id == execution_id
    ).first()
    if not exec_:
        raise HTTPException(status_code=404, detail="Execution not found")

    return WorkflowStatusResponse(
        execution_id=exec_.id,
        ticket_id=exec_.ticket_id,
        status=exec_.status,
        result=exec_.result,
        error_message=exec_.error,
        started_at=exec_.started_at,
        finished_at=exec_.finished_at,
    )


# ── Scheduler service ───────────────────────────────────────────────────────────

def run_pending_workflows():
    """
    Scheduler: procura tickets pendentes e executa o workflow AI.
    Chamado periodicamente pelo APScheduler (main.py).

    Usa o novo scheduler em app.ai.scheduler.scheduler_service se disponível.
    """
    from app.database import SessionLocal
    from app.api.routes.ai_config import _runtime_config as ai_config

    if not ai_config.get("workflow_enabled", True):
        return {"status": "skipped", "reason": "workflow_enabled=false"}

    # Try to use the new scheduler service if available
    try:
        from app.ai.scheduler.scheduler_service import _run_scheduler_job
        _run_scheduler_job()
        return {"status": "ok", "scheduler": "new"}
    except Exception:
        pass

    # Fallback: inline execution (compatibilidade)
    db = SessionLocal()
    try:
        from uuid import uuid4 as uuid4_func

        # Find tickets that need AI processing
        from sqlalchemy.orm import aliased

        executed_ids = db.query(AIWorkflowExecution.ticket_id).filter(
            AIWorkflowExecution.status.in_(["running", "completed", "pending"])
        ).subquery()

        pending_tickets = db.query(Ticket).filter(
            Ticket.status.notin_(["closed", "resolved"]),
            Ticket.ai_processing_status.in_(["not_processed", "pending"]) | (Ticket.ai_processing_status == None),  # noqa: E711
            ~Ticket.id.in_(executed_ids)
        ).order_by(
            Ticket.priority.desc(),
            Ticket.created_at.asc()
        ).limit(20).all()

        results = []

        for ticket in pending_tickets:
            try:
                thread_id = str(uuid4_func())

                execution = AIWorkflowExecution(
                    ticket_id=ticket.id,
                    workflow_name="ticket_ai_assistant",
                    status="pending",
                    thread_id=thread_id,
                    dry_run=True,
                    started_at=datetime.utcnow(),
                )
                db.add(execution)
                ticket.ai_processing_status = "pending"
                db.commit()
                db.refresh(execution)

                ticket_data = {
                    "id": ticket.id,
                    "title": ticket.title,
                    "description": ticket.description,
                    "status": ticket.status,
                    "priority": ticket.priority,
                    "category": ticket.category,
                    "customer_id": ticket.customer_id,
                    "history": "",
                    "sla_id": ticket.sla_id,
                    "sla_response_limit": ticket.sla_response_limit,
                    "sla_resolution_limit": ticket.sla_resolution_limit,
                }

                from app.ai.workflows.ticket_agent import run_ticket_workflow
                result = run_ticket_workflow(
                    ticket_id=ticket.id,
                    execution_id=execution.id,
                    thread_id=thread_id,
                    ticket_data=ticket_data,
                    dry_run=True,
                )

                execution.status = "completed"
                execution.finished_at = datetime.utcnow()
                execution.result = result
                ticket.ai_processing_status = "completed"
                ticket.ai_last_action_at = datetime.utcnow()
                db.commit()

                results.append({"ticket_id": str(ticket.id), "status": "ok"})

            except Exception as e:
                results.append({"ticket_id": str(ticket.id), "status": "error", "error": str(e)})

        return {"status": "ok", "processed": len(results), "results": results}

    finally:
        db.close()


# ── Helpers ─────────────────────────────────────────────────────────────────────

def _save_classification(db: Session, ticket_id: UUID, execution_id: UUID, classification: dict):
    """Persiste resultado de classificação em ai_ticket_classifications."""
    from app.models.ai_models import AITicketClassification

    existing = db.query(AITicketClassification).filter(
        AITicketClassification.ticket_id == ticket_id
    ).first()

    data = {
        "category": classification.get("category"),
        "priority": classification.get("priority"),
        "sentiment": classification.get("sentiment"),
        "intent": classification.get("intent"),
        "confidence": classification.get("confidence"),
        "language": classification.get("language"),
        "execution_id": execution_id,
    }

    if existing:
        for key, value in data.items():
            if hasattr(existing, key):
                setattr(existing, key, value)
    else:
        obj = AITicketClassification(ticket_id=ticket_id, **data)
        db.add(obj)


def _save_escalation(db: Session, ticket_id: UUID, execution_id: UUID, result: dict):
    """Persiste resultado de escalação em ai_ticket_escalations."""
    from app.models.ai_models import AITicketEscalation

    escalation = result.get("escalation_decision", {})
    classification = result.get("classification", {})

    existing = db.query(AITicketEscalation).filter(
        AITicketEscalation.ticket_id == ticket_id
    ).first()

    data = {
        "should_escalate": escalation.get("should_escalate") or result.get("escalation_needed"),
        "escalation_reason": escalation.get("escalation_reason"),
        "confidence": escalation.get("confidence") or classification.get("confidence"),
        "priority": classification.get("priority") or result.get("priority"),
        "execution_id": execution_id,
    }

    if existing:
        for key, value in data.items():
            if hasattr(existing, key):
                setattr(existing, key, value)
    else:
        obj = AITicketEscalation(ticket_id=ticket_id, **data)
        db.add(obj)


def _save_suggestion(db: Session, ticket_id: UUID, execution_id: UUID, result: dict):
    """Persiste sugestão de resposta em ai_ticket_suggestions."""
    from app.models.ai_models import AITicketSuggestion

    suggestion = result.get("suggested_response", {})

    existing = db.query(AITicketSuggestion).filter(
        AITicketSuggestion.ticket_id == ticket_id
    ).first()

    data = {
        "suggestion": suggestion,
        "confidence": suggestion.get("confidence"),
        "execution_id": execution_id,
    }

    if existing:
        for key, value in data.items():
            if hasattr(existing, key):
                setattr(existing, key, value)
    else:
        obj = AITicketSuggestion(
            ticket_id=ticket_id,
            suggestion_type="ai_suggested_response",
            **data
        )
        db.add(obj)
