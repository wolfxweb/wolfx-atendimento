"""
Router — funções de routing entre nós do grafo LangGraph.

Cada função recebe o state e retorna o nome do próximo nó
(ou um literal como "__end__").
"""
from typing import Literal


def route_after_classify(state: dict) -> Literal["check_approval", "__end__"]:
    """classify → check_approval (sempre que classify complete)."""
    if state.get("error_message"):
        return "__end__"
    return "check_approval"


def route_after_check_approval(state: dict) -> Literal[
    "human_approval", "rag_lookup", "__end__"
]:
    """
    check_approval →:
      - pending_approval=True → human_approval (pausa, aguarda humano)
      - pending_approval=False → rag_lookup (continua fluxo normal)
    """
    if state.get("error_message"):
        return "__end__"
    if state.get("pending_approval"):
        return "human_approval"
    return "rag_lookup"


def route_after_rag_lookup(state: dict) -> Literal["suggest_response", "__end__"]:
    """rag_lookup → suggest_response."""
    if state.get("error_message"):
        return "__end__"
    return "suggest_response"


def route_after_suggest_response(state: dict) -> Literal[
    "sla_review", "human_approval", "__end__"
]:
    """
    suggest_response →:
      - has_action=True → human_approval (precisa confirmar acção operacional)
      - otherwise → sla_review
    """
    if state.get("error_message"):
        return "__end__"

    suggestion = state.get("suggested_response", {})
    if suggestion.get("has_action"):
        return "human_approval"
    return "sla_review"


def route_after_sla_review(state: dict) -> Literal[
    "escalate", "finalize", "__end__"
]:
    """
    sla_review →:
      - breach_risk=True → escalate
      - otherwise → finalize
    """
    if state.get("error_message"):
        return "__end__"

    sla = state.get("sla_status", {})
    if sla.get("breach_risk"):
        return "escalate"
    return "finalize"


def route_after_escalate(state: dict) -> Literal["finalize", "__end__"]:
    """escalate → finalize (sempre, depois de decidir escalação)."""
    if state.get("error_message"):
        return "__end__"
    return "finalize"


def route_after_human_approval(state: dict) -> Literal[
    "rag_lookup", "finalize", "__end__"
]:
    """
    human_approval (após resume) →:
      - rejected → finalize (não aplicar sugestão)
      - approved → rag_lookup (continua para sugestão) ou finalize
    """
    if state.get("error_message"):
        return "__end__"

    decision = state.get("human_decision")
    if decision == "rejected":
        return "finalize"
    # approved → continua para rag_lookup
    return "rag_lookup"
