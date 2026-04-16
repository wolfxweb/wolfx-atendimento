"""
AI Rules API Routes - Phase 1
Manage AI approval rules (dry_run=True enforced)
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.database import get_db
from app.models.ai_models import AIApprovalRule, AIApproval
from app.schemas.ai_schemas import (
    AIApprovalRuleCreate, AIApprovalRuleUpdate, AIApprovalRuleResponse
)
from app.api.routes.auth import get_current_user
from app.models.models import User

router = APIRouter(prefix="/api/v1/ai/rules", tags=["AI Rules"])


@router.get("", response_model=list[AIApprovalRuleResponse])
def list_rules(
    approval_type: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db)
):
    q = db.query(AIApprovalRule)
    if approval_type:
        q = q.filter(AIApprovalRule.approval_type == approval_type)
    if is_active is not None:
        q = q.filter(AIApprovalRule.is_active == is_active)
    return q.order_by(AIApprovalRule.created_at.desc()).all()


@router.post("", response_model=AIApprovalRuleResponse)
def create_rule(
    rule: AIApprovalRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Enforce dry_run=True for all rules in phase 1
    db_rule = AIApprovalRule(
        **rule.model_dump(),
        dry_run=True,  # ALWAYS TRUE in phase 1
        created_by=current_user.id
    )
    db.add(db_rule)
    db.commit()
    db.refresh(db_rule)
    return db_rule


@router.get("/{rule_id}", response_model=AIApprovalRuleResponse)
def get_rule(rule_id: UUID, db: Session = Depends(get_db)):
    rule = db.query(AIApprovalRule).filter(AIApprovalRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    return rule


@router.patch("/{rule_id}", response_model=AIApprovalRuleResponse)
def update_rule(
    rule_id: UUID,
    update: AIApprovalRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    rule = db.query(AIApprovalRule).filter(AIApprovalRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")

    update_data = update.model_dump(exclude_unset=True)

    # Enforce dry_run=True for all rules in phase 1
    if 'dry_run' in update_data:
        del update_data['dry_run']  # Ignore - always True

    for key, value in update_data.items():
        setattr(rule, key, value)

    rule.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}")
def delete_rule(rule_id: UUID, db: Session = Depends(get_db)):
    rule = db.query(AIApprovalRule).filter(AIApprovalRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()
    return {"status": "deleted"}


@router.post("/{rule_id}/test")
def test_rule(rule_id: UUID, db: Session = Depends(get_db)):
    """Simulate rule against recent approvals without applying."""
    rule = db.query(AIApprovalRule).filter(AIApprovalRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")

    recent = db.query(AIApproval).order_by(
        AIApproval.created_at.desc()
    ).limit(20).all()

    matches = []
    for approval in recent:
        match = (
            approval.approval_type == rule.approval_type and
            (rule.ticket_priority is None or approval.ticket_priority == rule.ticket_priority) and
            (approval.confidence or 0) >= float(rule.min_confidence)
        )
        if match:
            matches.append({
                "approval_id": str(approval.id),
                "ticket_id": str(approval.ticket_id),
                "approval_type": approval.approval_type,
                "confidence": float(approval.confidence) if approval.confidence else None,
                "human_decision": approval.human_decision
            })

    return {"rule_id": str(rule_id), "tested_against": len(recent), "matches": matches}