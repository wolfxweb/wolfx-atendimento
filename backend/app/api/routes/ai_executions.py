"""
AI Executions API Routes - Phase 1
Manage AI workflow executions and audit logs
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.database import get_db
from app.models.ai_models import AIWorkflowExecution, AIAuditLog
from app.schemas.ai_schemas import AIExecutionResponse, AIAuditLogResponse
from sqlalchemy import desc

router = APIRouter(prefix="/api/v1/ai/executions", tags=["AI Executions"])


@router.get("", response_model=list[AIExecutionResponse])
def list_executions(
    status: Optional[str] = Query(None),
    workflow_name: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: Session = Depends(get_db)
):
    q = db.query(AIWorkflowExecution)
    if status:
        q = q.filter(AIWorkflowExecution.status == status)
    if workflow_name:
        q = q.filter(AIWorkflowExecution.workflow_name == workflow_name)
    return q.order_by(desc(AIWorkflowExecution.created_at)).offset(offset).limit(limit).all()


@router.get("/{execution_id}", response_model=AIExecutionResponse)
def get_execution(execution_id: UUID, db: Session = Depends(get_db)):
    execution = db.query(AIWorkflowExecution).filter(
        AIWorkflowExecution.id == execution_id
    ).first()
    if not execution:
        raise HTTPException(404, "Execution not found")
    return execution


@router.get("/{execution_id}/logs", response_model=list[AIAuditLogResponse])
def get_execution_logs(execution_id: UUID, db: Session = Depends(get_db)):
    return db.query(AIAuditLog).filter(
        AIAuditLog.execution_id == execution_id
    ).order_by(AIAuditLog.created_at).all()