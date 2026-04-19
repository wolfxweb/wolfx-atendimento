"""
Suggest Response Node — usa o template da BD + LLM real.
"""
from typing import Any
from app.ai.chains.suggestion import get_suggestion_prompt
from app.services.llm_service import get_llm_service, extract_json, format_kb_context
from app.database import SessionLocal


def suggest_response_node(state: dict[str, Any]) -> dict[str, Any]:
    """
    Node de sugestão de resposta.

    Lê o template 'suggestion' da BD → prepara prompt →
    chama LLM → guarda sugestão em state.
    """
    ticket_id = state.get("ticket_id", "")
    title = state.get("title", "")
    description = state.get("description", "")
    category = state.get("category", "geral")
    priority = state.get("priority", "normal")
    kb_context_chunks = state.get("kb_context_chunks", [])
    customer_name = state.get("customer_name", "Cliente")
    intent = state.get("intent", "")
    history = state.get("history", "")

    kb_context = format_kb_context(kb_context_chunks)

    prompt = get_suggestion_prompt(
        title, description, category, priority,
        kb_context, customer_name, intent, history
    )

    db = SessionLocal()
    try:
        llm = get_llm_service(db)

        system_prompt = (
            "Eres un assistente AI que gera sugestões de resposta para tickets de suporte. "
            "Respondes APENAS com JSON válido, sem texto extra. "
            '{"response": "...", "confidence": 0.0-1.0, "has_action": true|false, '
            '"operational_action": {"type": "update_field|notify|escalate", "details": "..."}|null, '
            '"references": [{"article_id": "...", "title": "..."}]}'
        )

        response = llm.complete(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=0.4,
            max_tokens=1024,
        )

        parsed = extract_json(response)

        if parsed and isinstance(parsed, dict):
            suggestion = {
                "response": parsed.get("response", ""),
                "confidence": float(parsed.get("confidence", 0.5)),
                "has_action": bool(parsed.get("has_action", False)),
                "operational_action": parsed.get("operational_action"),
                "references": parsed.get("references", []),
            }
        else:
            suggestion = {
                "response": f"Caro(a) {customer_name}, recebemos o seu contacto e estamos a analisar. Entraremos em contacto brevemente.",
                "confidence": 0.0,
                "has_action": False,
                "operational_action": None,
                "references": [],
            }

    except Exception as e:
        suggestion = {
            "response": f"Caro(a) {customer_name}, recebemos o seu contacto e estamos a analisar. Entraremos em contacto brevemente.",
            "confidence": 0.0,
            "has_action": False,
            "operational_action": None,
            "references": [],
            "error": str(e)[:100],
        }

    finally:
        db.close()

    return {
        "suggestion": suggestion,
        "should_continue": True,
        "node": "suggest_response",
    }
