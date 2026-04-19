"""
AI Approvals API Routes - List, approve, reject escalation requests.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.database import get_db
from sqlalchemy.orm import Session
from app.models.ai_models import AIApproval
from app.api.routes.auth import get_current_user
from app.models.models import User, Ticket
from app.api.routes.ai_config import _runtime_config as ai_config

router = APIRouter(prefix="/ai/approvals", tags=["AI Approvals"])


class ApprovalResponse(BaseModel):
    id: UUID
    ticket_id: UUID
    execution_id: UUID
    approval_type: str
    step_description: str
    ai_suggestion: dict
    confidence: Optional[float]
    ticket_priority: Optional[str]
    ticket_category: Optional[str]
    dry_run: bool
    auto_skipped: bool
    human_decision: Optional[str]
    human_notes: Optional[str]
    approver_user_id: Optional[UUID]
    approved_at: Optional[datetime]
    created_at: datetime
    expires_at: Optional[datetime]

    class Config:
        from_attributes = True


class ApprovalDecisionRequest(BaseModel):
    decision: str  # "approved" | "rejected"
    notes: Optional[str] = None


class ApprovalDecisionResponse(BaseModel):
    id: UUID
    human_decision: str
    approver_user_id: UUID
    approved_at: datetime


@router.get("", response_model=list[ApprovalResponse])
def list_approvals(
    status: Optional[str] = Query(None, description="Filter by human_decision: pending, approved, rejected"),
    approval_type: Optional[str] = Query(None),
    ticket_id: Optional[UUID] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    """
    Lista aprovações AI.
    
    - status=pending: aprovações por decidir (human_decision IS NULL)
    - status=approved: aprovações aceite
    - status=rejected: aprovações recusadas
    """
    q = db.query(AIApproval)

    if status == "pending":
        q = q.filter(AIApproval.human_decision == None)
    elif status == "approved":
        q = q.filter(AIApproval.human_decision == "approved")
    elif status == "rejected":
        q = q.filter(AIApproval.human_decision == "rejected")

    if approval_type:
        q = q.filter(AIApproval.approval_type == approval_type)

    if ticket_id:
        q = q.filter(AIApproval.ticket_id == ticket_id)

    return q.order_by(AIApproval.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/{approval_id}", response_model=ApprovalResponse)
def get_approval(
    approval_id: UUID,
    db: Session = Depends(get_db),
):
    """Retorna uma aprovação específica."""
    approval = db.query(AIApproval).filter(AIApproval.id == approval_id).first()
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")
    return approval


@router.patch("/{approval_id}/decision", response_model=ApprovalDecisionResponse)
def decide_approval(
    approval_id: UUID,
    body: ApprovalDecisionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Agent decide sobre uma aprovação.

    - decision=approved: a sugestão AI é aceite — auto-reply é enviada ao cliente
    - decision=rejected: a sugestão AI é recusada

    Após gravar a decisão,.retoma o workflow LangGraph se estiver em pause.
    """
    if body.decision not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="decision must be 'approved' or 'rejected'")

    approval = db.query(AIApproval).filter(AIApproval.id == approval_id).first()
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")

    if approval.human_decision is not None:
        raise HTTPException(status_code=409, detail="Approval already decided")

    approval.human_decision = body.decision
    approval.human_notes = body.notes
    approval.approver_user_id = current_user.id
    approval.approved_at = datetime.utcnow()

    # If approved, update ticket and send reply
    if body.decision == "approved":
        _apply_approval_actions(db, approval)

    db.commit()
    db.refresh(approval)

    # ── Resume LangGraph workflow if paused ─────────────────────────
    try:
        _resume_langgraph_workflow(
            db=db,
            execution_id=approval.execution_id,
            decision=body.decision,
            notes=body.notes,
            approver_id=current_user.id,
        )
    except Exception as e:
        print(f"[approvals] Could not resume LangGraph workflow: {e}")

    return ApprovalDecisionResponse(
        id=approval.id,
        human_decision=approval.human_decision,
        approver_user_id=approval.approver_user_id,
        approved_at=approval.approved_at,
    )


def _apply_approval_actions(db: Session, approval: AIApproval):
    """
    Após aprovação, aplica as acções definidas na sugestão AI:
    1. Actualiza a categoria/prioridade do ticket
    2. Adiciona um comentário com a resposta sugerida
    """
    ticket = db.query(Ticket).filter(Ticket.id == approval.ticket_id).first()
    if not ticket:
        return

    suggestion = approval.ai_suggestion or {}

    # 1. Update ticket priority/category if override suggested
    priority_override = suggestion.get("priority_override")
    if priority_override and priority_override in ("low", "normal", "high", "urgent"):
        ticket.priority = priority_override

    category_name = suggestion.get("classification", {}).get("category")
    if category_name:
        from app.models.models import Category
        cat = db.query(Category).filter(Category.name.ilike(f"%{category_name}%")).first()
        if cat:
            ticket.category_id = cat.id

    # 2. Add comment with AI suggestion (field: suggested_response)
    suggested_text = (
        suggestion.get("suggested_response", {}).get("response")
        or suggestion.get("response")
    )
    if suggested_text:
        from app.models.models import Comment
        comment = Comment(
            ticket_id=ticket.id,
            author_id=approval.approver_user_id,
            body=suggested_text,
            is_public=True,
        )
        db.add(comment)

    # 3. Notify via Telegram if configured
    _notify_telegram(approval, ticket)

    db.flush()


def _resume_langgraph_workflow(
    db: Session,
    execution_id,
    decision: str,
    notes: str | None,
    approver_id,
):
    """
    Retoma o workflow LangGraph pausado após aprovação humana.

    Usa o thread_id da AIWorkflowExecution para identificar o checkpoint.
    """
    from app.models.ai_models import AIWorkflowExecution

    execution = db.query(AIWorkflowExecution).filter(
        AIWorkflowExecution.id == execution_id
    ).first()

    if not execution or not execution.thread_id:
        return

    if execution.status != "awaiting_approval":
        return

    try:
        from app.ai.workflows.ticket_agent import resume_workflow

        resume_workflow(
            thread_id=execution.thread_id,
            resume_value={
                "decision": decision,
                "notes": notes or "",
                "approver_id": str(approver_id),
            },
        )

        # Update execution status
        execution.status = "running"   # will be set to completed by finalize
        db.commit()

    except Exception as e:
        print(f"[resume] LangGraph resume failed: {e}")
        # Don't fail the approval request if resume fails



def _notify_telegram(approval: AIApproval, ticket: Ticket):
    """Envia notificação Telegram ao agente sobre aprovação necessária."""
    try:
        import os
        telegram_token = os.environ.get("TELEGRAM_BOT_TOKEN")
        telegram_chat_id = os.environ.get("TELEGRAM_CHAT_ID")

        if not telegram_token or not telegram_chat_id:
            return

        import httpx
        classification = approval.ai_suggestion.get("classification", {})
        text = (
            f"✅ *Aprovação AI Acceptada*\n\n"
            f"🎫 Ticket: {ticket.title}\n"
            f"📂 Categoria: {approval.ticket_category or 'N/A'}\n"
            f"⚡ Prioridade: {approval.ticket_priority or 'N/A'}\n"
            f"🧠 Confiança AI: {approval.confidence or 'N/A'}\n"
            f"📝 Decisão: {approval.step_description}"
        )
        httpx.post(
            f"https://api.telegram.org/bot{telegram_token}/sendMessage",
            params={"chat_id": telegram_chat_id, "text": text, "parse_mode": "Markdown"},
            timeout=10,
        )
    except Exception:
        pass  # Non-critical
