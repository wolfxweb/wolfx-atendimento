"""
AI Scheduler Service — processo de background que corre a cada 5 minutos.

Responsabilidades:
  1. Advisory lock PostgreSQL (evita schedulers duplicados)
  2. Buscar tickets elegíveis (não processados, não closed/resolved)
  3. Para cada ticket: criar AIWorkflowExecution + dispatch thread
  4. Limite: máx 5 execuções concurrentes

Uso (startup):
    from app.ai.scheduler.scheduler_service import start_scheduler
    start_scheduler()
"""
import logging
import threading
from uuid import uuid4, UUID
from datetime import datetime
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import text

from app.database import SessionLocal, engine
from app.models.ai_models import AIWorkflowExecution, Ticket
from app.models.ticket import Ticket as TicketModel
from app.ai.workflows.ticket_agent import run_ticket_workflow


logger = logging.getLogger(__name__)

ADVISORY_LOCK_KEY = 1234567890   # pg_try_advisory_lock(key)
MAX_CONCURRENT_RUNNING = 5
SCHEDULER_INTERVAL_MINUTES = 5

_scheduler: Optional[BackgroundScheduler] = None


# ── Eligibility query ─────────────────────────────────────────────

def get_eligible_tickets(db: SessionLocal, limit: int = 20) -> list[dict]:
    """
    Busca tickets elegíveis para processamento AI.

    Critérios:
      - ai_processing_status IN ('not_processed', 'awaiting_approval')
      - status NOT IN ('closed', 'resolved')
      - Sem execution pendente (pending/running/awaiting_approval)
    """
    query = text("""
        SELECT t.id, t.title, t.description, t.status, t.priority,
               t.category, t.customer_id, t.history,
               t.sla_id, t.sla_response_limit, t.sla_resolution_limit,
               t.created_at, t.updated_at
        FROM tickets t
        WHERE t.ai_processing_status IN ('not_processed', 'awaiting_approval')
          AND t.status NOT IN ('closed', 'resolved')
          AND NOT EXISTS (
              SELECT 1 FROM ai_workflow_executions e
              WHERE e.ticket_id = t.id
                AND e.status IN ('pending', 'running', 'awaiting_approval')
          )
        ORDER BY
            CASE t.priority
                WHEN 'urgent' THEN 1
                WHEN 'high'   THEN 2
                WHEN 'normal' THEN 3
                WHEN 'low'    THEN 4
            END,
            t.created_at ASC
        LIMIT :limit
    """)

    rows = db.execute(query, {"limit": limit}).fetchall()
    tickets = []
    for r in rows:
        tickets.append({
            "id": r.id,
            "title": r.title,
            "description": r.description,
            "status": r.status,
            "priority": r.priority,
            "category": r.category,
            "customer_id": r.customer_id,
            "history": r.history or "",
            "sla_id": r.sla_id,
            "sla_response_limit": r.sla_response_limit,
            "sla_resolution_limit": r.sla_resolution_limit,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
        })
    return tickets


def count_running_executions(db: SessionLocal) -> int:
    """Conta execuções em curso (pending + running)."""
    result = db.execute(
        text("SELECT COUNT(*) FROM ai_workflow_executions WHERE status IN ('pending', 'running')")
    ).scalar()
    return int(result or 0)


# ── Per-ticket dispatch ──────────────────────────────────────────

def _process_ticket_async(
    ticket_id: UUID,
    execution_id: UUID,
    thread_id: str,
    ticket_data: dict,
    dry_run: bool,
):
    """
    Wrapper que executa run_ticket_workflow num thread separado.

    Actualiza o status da execution para 'running' antes de começar.
    """
    db = SessionLocal()
    try:
        db.execute(
            AIWorkflowExecution.__table__.update()
            .where(AIWorkflowExecution.id == execution_id)
            .values(status="running")
        )
        db.commit()
    finally:
        db.close()

    try:
        result = run_ticket_workflow(
            ticket_id=ticket_id,
            execution_id=execution_id,
            thread_id=thread_id,
            ticket_data=ticket_data,
            dry_run=dry_run,
        )
        logger.info(
            f"[scheduler] ticket={ticket_id} finished "
            f"node={result.get('current_node')} "
            f"error={result.get('error_message')}"
        )
    except Exception as e:
        logger.error(f"[scheduler] ticket={ticket_id} exception: {e}")
        db = SessionLocal()
        try:
            db.execute(
                AIWorkflowExecution.__table__.update()
                .where(AIWorkflowExecution.id == execution_id)
                .values(status="failed", error=str(e)[:500])
            )
            db.commit()
        finally:
            db.close()


# ── Main scheduler job ────────────────────────────────────────────

def _run_scheduler_job():
    """
    Job principal do scheduler. Corre a cada 5 minutos.

    Passos:
      1. pg_try_advisory_lock
      2. Contar running — se >= 5, sair
      3. Buscar tickets elegíveis
      4. Para cada um: criar execution + thread assíncrono
      5. pg_advisory_unlock
    """
    logger.info("[scheduler] Starting job...")

    conn = engine.raw_connection()
    try:
        # 1. Advisory lock
        cursor = conn.cursor()
        cursor.execute("SELECT pg_try_advisory_lock(%s)", (ADVISORY_LOCK_KEY,))
        acquired = cursor.fetchone()[0]
        if not acquired:
            logger.info("[scheduler] Could not acquire lock, another instance running")
            return
        cursor.close()
        conn.commit()

        try:
            db = SessionLocal(bind=conn)
            try:
                # 2. Verificar concurrent limit
                running = count_running_executions(db)
                if running >= MAX_CONCURRENT_RUNNING:
                    logger.info(
                        f"[scheduler] {running} running, at limit {MAX_CONCURRENT_RUNNING}, skipping"
                    )
                    return

                slots = MAX_CONCURRENT_RUNNING - running
                tickets = get_eligible_tickets(db, limit=slots)

                if not tickets:
                    logger.info("[scheduler] No eligible tickets")
                    return

                logger.info(f"[scheduler] Processing {len(tickets)} tickets")

                dry_run = True  # TODO: ler de config/DB

                for td in tickets:
                    ticket_id = td["id"]
                    thread_id = str(uuid4())

                    # Criar AIWorkflowExecution
                    execution = AIWorkflowExecution(
                        id=uuid4(),
                        ticket_id=ticket_id,
                        workflow_name="ticket_ai_assistant",
                        status="pending",
                        thread_id=thread_id,
                        payload={"ticket_snapshot": td},
                        dry_run=dry_run,
                    )
                    db.add(execution)
                    db.flush()

                    # Actualizar ticket
                    db.execute(
                        TicketModel.__table__.update()
                        .where(TicketModel.id == ticket_id)
                        .values(ai_processing_status="pending")
                    )

                    db.commit()

                    # Dispatch thread
                    t = threading.Thread(
                        target=_process_ticket_async,
                        args=(
                            ticket_id,
                            execution.id,
                            thread_id,
                            td,
                            dry_run,
                        ),
                        daemon=True,
                    )
                    t.start()

                logger.info(f"[scheduler] Dispatched {len(tickets)} workflows")

            finally:
                db.close()
        finally:
            # Release lock
            cursor = conn.cursor()
            cursor.execute("SELECT pg_advisory_unlock(%s)", (ADVISORY_LOCK_KEY,))
            cursor.close()
            conn.commit()

    except Exception as e:
        logger.error(f"[scheduler] Job error: {e}")
    finally:
        conn.close()


# ── Start / Stop ─────────────────────────────────────────────────

def start_scheduler():
    """Inicia o BackgroundScheduler (chamar uma vez no startup da app)."""
    global _scheduler

    if _scheduler is not None and _scheduler.running:
        logger.info("[scheduler] Already running")
        return

    _scheduler = BackgroundScheduler(timezone="UTC", daemon=True)
    _scheduler.add_job(
        _run_scheduler_job,
        trigger=IntervalTrigger(minutes=SCHEDULER_INTERVAL_MINUTES),
        id="ai_scheduler_job",
        name="AI Ticket Scheduler (every 5 min)",
        replace_existing=True,
        max_instances=1,
    )
    _scheduler.start()
    logger.info("[scheduler] Started")


def stop_scheduler():
    """Para o scheduler (chamar no shutdown da app)."""
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("[scheduler] Stopped")


def trigger_now():
    """Dispara o scheduler manualmente (útil para testes)."""
    if _scheduler:
        _scheduler.execute_job(_scheduler.get_job("ai_scheduler_job"))
    else:
        _run_scheduler_job()
