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
from pydantic import BaseModel
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


# ── Dashboard endpoint (for frontend AIMetrics page) ──────────────────────────

class AIDashboardMetricItem(BaseModel):
    date: str
    count: int = 0
    avg_confidence: float = 0.0


class AIDashboardResponse(BaseModel):
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    ai_handled: int = 0
    human_handled: int = 0
    avg_response_time_ms: float = 0.0
    avg_confidence: float = 0.0
    requests_by_intent: dict[str, int] = {}
    requests_by_day: list[AIDashboardMetricItem] = []
    response_time_trend: list[dict[str, str | float]] = []
    confidence_trend: list[dict[str, str | float]] = []


@router.get("/dashboard", response_model=AIDashboardResponse)
def get_ai_dashboard(db: Session = Depends(get_db)):
    """
    Dashboard de métricas AI para o frontend.
    Agrega dados de AIWorkflowExecution e AIApproval.
    """
    # Totais
    total = db.query(AIWorkflowExecution).count()
    completed = db.query(AIWorkflowExecution).filter(
        AIWorkflowExecution.status == "completed"
    ).count()
    failed = db.query(AIWorkflowExecution).filter(
        AIWorkflowExecution.status == "failed"
    ).count()

    # Approvals (human handled = approved + rejected)
    human_handled = db.query(AIApproval).filter(
        AIApproval.human_decision.in_(["approved", "rejected"])
    ).count()

    # AI handled = auto-approved (dry_run=false, i.e. AI actually applied the decision)
    ai_handled = db.query(AIApproval).filter(
        AIApproval.dry_run == False
    ).count()

    # Avg confidence from approvals
    avg_conf = db.query(func.avg(AIApproval.confidence)).filter(
        AIApproval.confidence.isnot(None)
    ).scalar() or 0.0

    # Avg response time from executions (in ms)
    avg_rt = db.query(func.avg(
        func.extract('epoch', AIWorkflowExecution.finished_at) -
        func.extract('epoch', AIWorkflowExecution.started_at)
    )).filter(
        AIWorkflowExecution.finished_at.isnot(None),
        AIWorkflowExecution.started_at.isnot(None)
    ).scalar() or 0.0
    avg_response_time_ms = float(avg_rt) * 1000  # convert seconds to ms

    # Requests by day (last 14 days)
    last14days = []
    for i in range(14):
        d = datetime.utcnow().date() - timedelta(days=13 - i)
        last14days.append(d.isoformat())

    from sqlalchemy import cast, Date
    daily_counts = db.query(
        cast(AIWorkflowExecution.started_at, Date).label('day'),
        func.count(AIWorkflowExecution.id).label('count'),
        func.avg(AIApproval.confidence).label('avg_conf')
    ).outerjoin(
        AIApproval, AIApproval.execution_id == AIWorkflowExecution.id
    ).filter(
        AIWorkflowExecution.started_at >= last14days[0]
    ).group_by(
        cast(AIWorkflowExecution.started_at, Date)
    ).all()

    by_day_map = {str(r.day): {'count': r.count, 'avg_confidence': float(r.avg_conf or 0)} for r in daily_counts}
    requests_by_day = [
        AIDashboardMetricItem(
            date=d,
            count=by_day_map.get(d, {}).get('count', 0),
            avg_confidence=by_day_map.get(d, {}).get('avg_confidence', 0.0)
        )
        for d in last14days
    ]

    # Confidence trend (same as requests_by_day but for charting)
    confidence_trend = [
        {'date': item.date, 'avg': item.avg_confidence}
        for item in requests_by_day
    ]

    # Response time trend
    response_time_trend = [
        {'date': item.date, 'avg_ms': item.count * 10}  # placeholder until we track real RT
        for item in requests_by_day
    ]

    return AIDashboardResponse(
        total_requests=total,
        successful_requests=completed,
        failed_requests=failed,
        ai_handled=ai_handled,
        human_handled=human_handled,
        avg_response_time_ms=round(avg_response_time_ms, 2),
        avg_confidence=float(avg_conf),
        requests_by_intent={},
        requests_by_day=requests_by_day,
        response_time_trend=response_time_trend,
        confidence_trend=confidence_trend,
    )