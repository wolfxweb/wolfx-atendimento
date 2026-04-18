"""
AI Metrics API Routes - Phase 1
Dashboard stats and aggregated metrics
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, timedelta
from app.database import get_db
from app.models.ai_models import AIApproval, AIWorkflowExecution, AIApprovalMetrics
from app.schemas.ai_schemas import AIStatsResponse, AIApprovalMetricsResponse

router = APIRouter(prefix="/ai", tags=["AI Metrics"])


@router.get("/stats", response_model=AIStatsResponse)
def get_ai_stats(db: Session = Depends(get_db)):
    today = datetime.utcnow().date()
    today_start = datetime.combine(today, datetime.min.time())

    pending = db.query(AIApproval).filter(AIApproval.human_decision.is_(None)).count()
    today_approved = db.query(AIApproval).filter(
        AIApproval.human_decision == "approved",
        func.date(AIApproval.approved_at) == today
    ).count()
    today_rejected = db.query(AIApproval).filter(
        AIApproval.human_decision == "rejected",
        func.date(AIApproval.approved_at) == today
    ).count()
    today_expired = db.query(AIApproval).filter(
        AIApproval.human_decision == "expired"
    ).count()
    avg_conf = db.query(func.avg(AIApproval.confidence)).filter(
        AIApproval.confidence.isnot(None)
    ).scalar()
    dry_run_matches = db.query(AIApproval).filter(
        AIApproval.dry_run == True,
        AIApproval.auto_skipped == True
    ).count()
    running = db.query(AIWorkflowExecution).filter(
        AIWorkflowExecution.status == "running"
    ).count()

    return AIStatsResponse(
        total_pending=pending,
        total_approved_today=today_approved,
        total_rejected_today=today_rejected,
        total_expired_today=today_expired,
        avg_confidence=avg_conf,
        dry_run_matches=dry_run_matches,
        executions_running=running
    )


@router.get("/metrics", response_model=list[AIApprovalMetricsResponse])
def get_metrics(
    granularity: str = Query("daily"),  # daily, weekly, monthly
    period_days: int = Query(30),
    db: Session = Depends(get_db)
):
    since = datetime.utcnow() - timedelta(days=period_days)
    return db.query(AIApprovalMetrics).filter(
        AIApprovalMetrics.period_start >= since,
        AIApprovalMetrics.granularity == granularity
    ).order_by(desc(AIApprovalMetrics.period_start)).all()