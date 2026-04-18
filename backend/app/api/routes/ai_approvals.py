"""
AI Approvals API Routes - Phase 1
List, approve, reject AI approval requests
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.database import get_db
from app.models.ai_models import AIApproval, AIWorkflowExecution
from app.schemas.ai_schemas import (
    AIApprovalResponse, AIApprovalApproveRequest,
    AIApprovalRejectRequest, AIApprovalUpdate
)
from app.api.routes.auth import get_current_user
from app.models.models import User
from sqlalchemy import desc

router = APIRouter(prefix="/ai/approvals", tags=["AI Approvals"])


@router.get("", response_model=list[AIApprovalResponse])
def list_approvals(
    status: Optional[str] = Query(None),  # pending, approved, rejected, expired
    approval_type: Optional[str] = Query(None),
    min_confidence: Optional[float] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: Session = Depends(get_db)
):
    q = db.query(AIApproval)
    if status == "pending":
        q = q.filter(AIApproval.human_decision.is_(None))
    elif status == "approved":
        q = q.filter(AIApproval.human_decision == "approved")
    elif status == "rejected":
        q = q.filter(AIApproval.human_decision == "rejected")
    elif status == "expired":
        q = q.filter(AIApproval.human_decision == "expired")
    if approval_type:
        q = q.filter(AIApproval.approval_type == approval_type)
    if min_confidence is not None:
        q = q.filter(AIApproval.confidence >= min_confidence)
    return q.order_by(desc(AIApproval.created_at)).offset(offset).limit(limit).all()


@router.get("/{approval_id}", response_model=AIApprovalResponse)
def get_approval(approval_id: UUID, db: Session = Depends(get_db)):
    approval = db.query(AIApproval).filter(AIApproval.id == approval_id).first()
    if not approval:
        raise HTTPException(404, "Approval not found")
    return approval


@router.post("/{approval_id}/approve")
def approve_approval(
    approval_id: UUID,
    body: AIApprovalApproveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    approval = db.query(AIApproval).filter(AIApproval.id == approval_id).first()
    if not approval:
        raise HTTPException(404, "Approval not found")
    if approval.human_decision is not None:
        raise HTTPException(400, "Approval already decided")

    approval.human_decision = "approved"
    approval.human_notes = body.notes
    approval.approver_user_id = current_user.id
    approval.approved_at = datetime.utcnow()

    db.commit()
    return {"status": "approved", "approval_id": str(approval_id)}


@router.post("/{approval_id}/reject")
def reject_approval(
    approval_id: UUID,
    body: AIApprovalRejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    approval = db.query(AIApproval).filter(AIApproval.id == approval_id).first()
    if not approval:
        raise HTTPException(404, "Approval not found")
    if approval.human_decision is not None:
        raise HTTPException(400, "Approval already decided")

    approval.human_decision = "rejected"
    approval.human_notes = body.notes
    approval.approver_user_id = current_user.id
    approval.approved_at = datetime.utcnow()

    db.commit()
    return {"status": "rejected", "approval_id": str(approval_id)}