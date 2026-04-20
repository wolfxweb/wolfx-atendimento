"""
Check Approval Node — decide se o ticket precisa de aprovação humana.

Todas as regras são código Python (não LLM).
"""
from typing import Any


# ── Regras de aprovação obrigatória ────────────────────────────────

SENSITIVE_INTENTS = {"refund", "legal", "data_deletion"}
CONFIDENCE_THRESHOLD = 0.70
PRIORITY_APPROVAL = {"urgent", "high"}


def check_approval_node(state: dict[str, Any]) -> dict[str, Any]:
    """
    Avalia se o ticket precisa de aprovação humana.

    Regras (todas em Python):
      1. confidence da classificação < 0.70
      2. intent ∈ {"refund", "legal", "data_deletion"}
      3. priority = "urgent" ou "high"
      4. SLA breach_risk = true
      5. has_action = true na sugestão de resposta

    Returns:
        pending_approval: bool
        approval_reasons: list[str]
        approval_type: str  # "classify_confirm", "response_confirm", "escalate_confirm"
    """
    classification = state.get("classification") or {}
    suggested_response = state.get("suggested_response") or {}
    sla_status = state.get("sla_status") or {}
    dry_run = state.get("dry_run", True)

    reasons: list[str] = []
    approval_type = "classify_confirm"

    # Regra 1: confiança baixa
    confidence = float(classification.get("confidence", 0.0))
    if confidence < CONFIDENCE_THRESHOLD:
        reasons.append(f"confiança baixa ({confidence:.2f} < {CONFIDENCE_THRESHOLD})")

    # Regra 2: intent sensível
    intent = classification.get("intent", "")
    if intent in SENSITIVE_INTENTS:
        reasons.append(f"intent sensível ({intent})")

    # Regra 3: prioridade alta
    priority = classification.get("priority", "normal")
    if priority in PRIORITY_APPROVAL:
        reasons.append(f"priority {priority}")

    # Regra 4: SLA breach risk
    breach_risk = sla_status.get("breach_risk", False) if sla_status else False
    if breach_risk:
        reasons.append("SLA breach risk")

    # Regra 5: resposta com acção operacional
    has_action = bool(suggested_response.get("has_action", False))
    if has_action:
        reasons.append("resposta tem acção operacional")

    pending = len(reasons) > 0

    # Se dry_run=True e há approval_reason, registamos mas não bloqueamos
    # (dry_run=TRUE = só monitoriza, nunca auto-aprova)
    if dry_run and pending:
        # Em modo dry_run,哨apenas logamos — não paramos o fluxo
        return {
            "pending_approval": False,   # não bloqueia em dry_run
            "approval_reasons": reasons,
            "approval_type": approval_type,
            "current_node": "check_approval",
        }

    return {
        "pending_approval": pending,
        "approval_reasons": reasons,
        "approval_type": approval_type,
        "current_node": "check_approval",
    }
