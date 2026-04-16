"""
AI Feedback API Routes - Phase 1
Submit and retrieve feedback on AI approval decisions
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.database import get_db
from app.models.ai_models import AIApprovalFeedback, AIApproval
from app.schemas.ai_schemas import AIApprovalFeedbackCreate, AIApprovalFeedbackResponse
from app.api.routes.auth import get_current_user
from app.models.models import User
from sqlalchemy import desc

router = APIRouter(prefix="/api/v1/ai/feedback", tags=["AI Feedback"])


@router.get("", response_model=list[AIApprovalFeedbackResponse])
def list_feedback(
    ai_correct: Optional[str] = Query(None),
    approval_type: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: Session = Depends(get_db)
):
    q = db.query(AIApprovalFeedback)
    if ai_correct:
        q = q.filter(AIApprovalFeedback.ai_correct == ai_correct)
    return q.order_by(desc(AIApprovalFeedback.created_at)).offset(offset).limit(limit).all()


@router.post("/{approval_id}", response_model=AIApprovalFeedbackResponse)
def create_feedback(
    approval_id: UUID,
    feedback: AIApprovalFeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Check if approval exists
    approval = db.query(AIApproval).filter(AIApproval.id == approval_id).first()
    if not approval:
        raise HTTPException(404, "Approval not found")

    # Check if feedback already exists
    existing = db.query(AIApprovalFeedback).filter(
        AIApprovalFeedback.approval_id == approval_id
    ).first()
    if existing:
        raise HTTPException(400, "Feedback already exists for this approval")

    db_feedback = AIApprovalFeedback(
        **feedback.model_dump(),
        approval_id=approval_id,
        evaluator_id=current_user.id
    )
    db.add(db_feedback)
    db.commit()
    db.refresh(db_feedback)
    return db_feedback


@router.get("/{approval_id}", response_model=AIApprovalFeedbackResponse)
def get_feedback(approval_id: UUID, db: Session = Depends(get_db)):
    feedback = db.query(AIApprovalFeedback).filter(
        AIApprovalFeedback.approval_id == approval_id
    ).first()
    if not feedback:
        raise HTTPException(404, "Feedback not found")
    return feedback