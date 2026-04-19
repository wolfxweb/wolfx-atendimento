"""
Suggest Response Node — gera resposta sugerida para o ticket.

Lê o template 'suggestion' da BD → prompt + KB context → LLM →
parse JSON → guarda em state['suggested_response'].
"""
from typing import Any
from datetime import datetime
from uuid import uuid4
from app.ai.chains.suggestion import get_suggestion_prompt
from app.services.llm_service import get_llm_service, extract_json
from app.services.langfuse_client import trace_llm_call
from app.database import SessionLocal
from app.models.ai_models import AIAuditLog


def suggest_response_node(state: dict[str, Any]) -> dict[str, Any]:
    """
    Node de sugestão de resposta.

    KB context vem do state['rag_articles'] (populado por rag_lookup_node).
    """
    ticket_data = state.get("ticket_data", {})
    title = ticket_data.get("title", "")
    description = ticket_data.get("description", "")
    category = state.get("category", "geral")
    priority = state.get("priority", "normal")
    intent = state.get("intent", "question")
    history = ticket_data.get("history", "")
    customer_name = ticket_data.get("customer_name", "Cliente")

    rag_articles = state.get("rag_articles", [])
    kb_context = (
        "\n".join(
            f"[{i+1}] {a.get('title','')}: {a.get('content','')[:200]}..."
            for i, a in enumerate(rag_articles)
        )
        if rag_articles
        else "Sem artigos relevantes encontrados."
    )

    prompt = get_suggestion_prompt(
        title, description, category, priority,
        kb_context, customer_name, intent, history
    )

    system_prompt = (
        "Eres un assistente AI que gera sugestões de resposta para tickets de suporte. "
        "Respondes APENAS com JSON válido, sem texto extra. "
        '{"response": "...", "confidence": 0.0-1.0, "has_action": true|false, '
        '"operational_action": {"type": "update_field|notify|escalate", "details": "..."}|null, '
        '"references": [{"article_id": "...", "title": "..."}]}'
    )

    db = SessionLocal()
    try:
        llm = get_llm_service(db)

        t0 = datetime.utcnow()
        response = llm.complete(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=0.4,
            max_tokens=1024,
        )
        latency_ms = int((datetime.utcnow() - t0).total_seconds() * 1000)

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
                "response": (
                    f"Caro(a) {customer_name}, "
                    "recebemos o seu contacto e estamos a analisar. "
                    "Entraremos em contacto brevemente."
                ),
                "confidence": 0.0,
                "has_action": False,
                "operational_action": None,
                "references": [],
            }

        # Trace LangFuse
        execution_id = state.get("execution_id")
        ticket_id = ticket_data.get("id") or state.get("ticket_id")
        trace_llm_call(
            operation="suggest_response",
            model=llm.model,
            input_text=prompt[:500],
            output_text=response[:500],
            usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            latency_ms=latency_ms,
            execution_id=execution_id,
            ticket_id=ticket_id,
        )

        # Audit log
        if execution_id:
            try:
                audit = AIAuditLog(
                    id=uuid4(),
                    execution_id=execution_id,
                    node_name="suggest_response",
                    action="node_exited",
                    actor="ai",
                    details={"confidence": suggestion["confidence"]},
                    latency_ms=latency_ms,
                )
                db.add(audit)
                db.commit()
            except Exception:
                db.rollback()

    except Exception as e:
        suggestion = {
            "response": (
                f"Caro(a) {customer_name}, "
                "recebemos o seu contacto e estamos a analisar."
            ),
            "confidence": 0.0,
            "has_action": False,
            "operational_action": None,
            "references": [],
            "error": str(e)[:100],
        }
    finally:
        db.close()

    return {
        "suggested_response": suggestion,
        "current_node": "suggest_response",
    }
