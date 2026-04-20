"""
Ticket AI Assistant — LangGraph StateGraph.

Workflow principal de processamento de tickets com IA.
Usa PostgreSQL checkpointer para persistência entre-interrompimentos
(interrupt para aprovação humana).

Fluxo:
    classify → check_approval → [rag_lookup → suggest_response → sla_review → escalate/finalize]
                              ↘ [human_approval → resume → rag_lookup/finalize]

Uso:
    from app.ai.workflows.ticket_agent import build_graph, run_ticket_workflow

    graph = build_graph()
    result = run_ticket_workflow(graph, ticket_id, execution_id, thread_id)
"""
import logging
from uuid import UUID, uuid4
from datetime import datetime
from typing import Any

from langgraph.graph import StateGraph, END
from langgraph.types import Command

from app.ai.workflows.states import TicketAgentState
from app.ai.workflows.nodes.classify import classify_node
from app.ai.workflows.nodes.rag_lookup import rag_lookup_node
from app.ai.workflows.nodes.check_approval import check_approval_node
from app.ai.workflows.nodes.suggest_response import suggest_response_node
from app.ai.workflows.nodes.sla_review import sla_review_node
from app.ai.workflows.nodes.escalate import escalate_node
from app.ai.workflows.nodes.human_approval import human_approval_node
from app.ai.workflows.nodes.finalize import finalize_node
from app.ai.workflows.router import (
    route_after_classify,
    route_after_check_approval,
    route_after_rag_lookup,
    route_after_suggest_response,
    route_after_sla_review,
    route_after_escalate,
    route_after_human_approval,
)
from app.ai.persistence.checkpointer import get_checkpointer
from app.database import SessionLocal
from app.models.ai_models import AIWorkflowExecution


logger = logging.getLogger(__name__)

GRAPH_VERSION = "v1.0.0"


def _build_graph() -> StateGraph:
    """Constrói o grafo LangGraph (sem compile — compilado em build_graph())."""
    from app.services.langfuse_client import flush

    builder = StateGraph(TicketAgentState)

    # ── Nós ─────────────────────────────────────────────────────────
    builder.add_node("classify", classify_node)
    builder.add_node("check_approval", check_approval_node)
    builder.add_node("rag_lookup", rag_lookup_node)
    builder.add_node("suggest_response", suggest_response_node)
    builder.add_node("sla_review", sla_review_node)
    builder.add_node("escalate", escalate_node)
    builder.add_node("human_approval", human_approval_node)
    builder.add_node("finalize", finalize_node)

    # ── Arestas (conditional routing) ───────────────────────────────
    # classify → check_approval
    builder.add_edge("classify", "check_approval")

    # check_approval → human_approval | rag_lookup
    builder.add_conditional_edges(
        "check_approval",
        route_after_check_approval,
        {
            "human_approval": "human_approval",
            "rag_lookup": "rag_lookup",
            "__end__": END,
        },
    )

    # rag_lookup → suggest_response
    builder.add_conditional_edges(
        "rag_lookup",
        route_after_rag_lookup,
        {"suggest_response": "suggest_response", "__end__": END},
    )

    # suggest_response → sla_review | human_approval
    builder.add_conditional_edges(
        "suggest_response",
        route_after_suggest_response,
        {
            "sla_review": "sla_review",
            "human_approval": "human_approval",
            "__end__": END,
        },
    )

    # sla_review → escalate | finalize
    builder.add_conditional_edges(
        "sla_review",
        route_after_sla_review,
        {"escalate": "escalate", "finalize": "finalize", "__end__": END},
    )

    # escalate → finalize
    builder.add_conditional_edges(
        "escalate",
        route_after_escalate,
        {"finalize": "finalize", "__end__": END},
    )

    # human_approval → rag_lookup | finalize (após aprovação/rejeição)
    builder.add_conditional_edges(
        "human_approval",
        route_after_human_approval,
        {"rag_lookup": "rag_lookup", "finalize": "finalize", "__end__": END},
    )

    # finalize → END
    builder.add_edge("finalize", END)

    # ── Entry point ────────────────────────────────────────────────
    builder.set_entry_point("classify")

    return builder


# ── Cached compiled graph ─────────────────────────────────────────

_compiled_graph = None


def build_graph():
    """
    Retorna o grafo LangGraph compilado (singleton).

    O checkpointer PostgreSQL é configurado aqui.
    O grafo é compilado uma vez e reutilizado em todas as invocações.
    """
    global _compiled_graph

    if _compiled_graph is None:
        builder = _build_graph()
        checkpointer = get_checkpointer()
        _compiled_graph = builder.compile(
            checkpointer=checkpointer,
            # interrupt_before parahuman_approval — o grafo para aqui
            # para aguardar decisão do humano
            interrupt_before=["human_approval"],
        )

    return _compiled_graph


# ── Run workflow ──────────────────────────────────────────────────

def run_ticket_workflow(
    ticket_id: UUID,
    execution_id: UUID,
    thread_id: str,
    ticket_data: dict,
    dry_run: bool = True,
) -> dict[str, Any]:
    """
    Executa o workflow LangGraph para um ticket.

    Args:
        ticket_id: UUID do ticket
        execution_id: UUID da AIWorkflowExecution
        thread_id: thread_id para o checkpointer (UUID string)
        ticket_data: snapshot dos dados do ticket
        dry_run: se True, não bloqueia em approval (só monitoriza)

    Returns:
        O estado final do grafo após completar ou pausar.
    """
    from app.services.langfuse_client import flush

    graph = build_graph()

    initial_state: TicketAgentState = {
        "ticket_id": ticket_id,
        "execution_id": execution_id,
        "thread_id": thread_id,
        "graph_version": GRAPH_VERSION,
        "ticket_data": ticket_data,
        "current_node": "classify",
        "pending_approval": False,
        "approval_reasons": [],
        "classification": None,
        "rag_articles": [],
        "suggested_response": None,
        "sla_status": None,
        "escalation_needed": False,
        "escalation_reason": None,
        "assign_to": None,
        "human_decision": None,
        "human_notes": None,
        "approver_id": None,
        "dry_run": dry_run,
        "retry_count": 0,
        "error_message": None,
        "started_at": datetime.utcnow(),
        "logs": [],
    }

    config = {
        "configurable": {
            "thread_id": thread_id,
            "checkpoint_id": str(execution_id),
            "version": GRAPH_VERSION,
        }
    }

    try:
        # Invoke — bloqueia até completion ou interrupt
        final_state = graph.invoke(initial_state, config=config)

        # Flush LangFuse traces
        flush()

        return final_state

    except Exception as e:
        import traceback
        logger.error(f"[ticket_agent] Workflow error: {e}\n{traceback.format_exc()}")
        flush()
        return {
            **initial_state,
            "error_message": str(e)[:500],
            "should_continue": False,
        }


def resume_workflow(
    thread_id: str,
    resume_value: dict,
) -> dict[str, Any]:
    """
    Retoma um workflow pausado (após aprovação humana).

    Args:
        thread_id: thread_id do workflow interrompido
        resume_value: {decision: "approved"|"rejected", notes: str, approver_id: UUID}

    Returns:
        O estado final após o resume.
    """
    from app.services.langfuse_client import flush

    graph = build_graph()

    config = {
        "configurable": {
            "thread_id": thread_id,
        }
    }

    try:
        # Command(resume=...) passa o valor para interrupt()
        final_state = graph.invoke(
            Command(resume=resume_value),
            config=config,
        )
        flush()
        return final_state
    except Exception as e:
        logger.error(f"[ticket_agent] Resume error: {e}")
        flush()
        return {"error_message": str(e)[:500]}


# ── Alias para retrocompatibilidade ───────────────────────────────
process_ticket = run_ticket_workflow
