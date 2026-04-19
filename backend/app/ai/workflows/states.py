"""
TicketAgentState — LangGraph TypedDict state.

LangGraph persists this state between nodes and across interrupts
(when waiting for human approval). The PostgreSQL checkpointer stores
snapshots keyed by (thread_id, checkpoint_id).
"""
from typing import TypedDict, Optional, Literal
from uuid import UUID
from datetime import datetime


class TicketAgentState(TypedDict, total=False):
    # ── Identificação ─────────────────────────────────────────────
    ticket_id: UUID
    execution_id: UUID
    thread_id: str              # LangGraph persistence thread (uuid4 str)
    graph_version: str          # e.g. "v1.0.0"

    # ── Dados do ticket (snapshot — evita N+1 queries) ───────────
    ticket_data: dict           # {id, title, description, status, priority,
                                 #  category, customer_id, customer_name, history,
                                 #  sla_id, sla_response_limit, sla_resolution_limit, ...}

    # ── Progresso do workflow ─────────────────────────────────────
    current_node: str
    next_node: Optional[str]
    pending_approval: bool
    approval_id: Optional[UUID]
    approval_reasons: list[str]  # ["confidence < 0.70", "priority urgent", ...]

    # ── Resultados dos nós ─────────────────────────────────────────
    classification: Optional[dict]   # {priority, category, intent, language,
                                      #   summary, confidence, reason}
    rag_articles: list[dict]         # [{id, title, content, score}]
    suggested_response: Optional[dict] # {text, confidence, has_action,
                                        #   operational_action, references}
    sla_status: Optional[dict]        # {status, time_remaining, breach_risk,
                                       #   sla_id, sla_name}
    escalation_needed: bool
    escalation_reason: Optional[str]
    assign_to: Optional[str]

    # ── Decisão humana (preenchido após aprovação) ────────────────
    human_decision: Optional[Literal["approved", "rejected"]]
    human_notes: Optional[str]
    approver_id: Optional[UUID]

    # ── Controlo de execução ──────────────────────────────────────
    dry_run: bool               # Se True, nunca auto-aprova (monitoriza só)
    retry_count: int
    error_message: Optional[str]
    started_at: datetime
    logs: list[dict]            # [{node, action, timestamp, details}, ...]
