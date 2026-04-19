"""
Suggest Response Node — gera resposta sugerida via LCEL chain + LangFuse callback.

Usa o chain LangChain (PromptTemplate | ChatOpenAI | JsonOutputParser)
com LangFuse CallbackHandler para tracing automático.
"""

import logging
from datetime import datetime
from uuid import uuid4
from typing import Any

from app.database import SessionLocal
from app.models.ai_models import AIAuditLog
from app.services.langfuse_client import get_langfuse_callback
from app.ai.chains.suggestion import get_suggestion_chain_with_handler


def suggest_response_node(state: dict[str, Any]) -> dict[str, Any]:
    """
    Node de sugestão de resposta.

    KB context vem do state['rag_articles'] (populado por rag_lookup_node).

    Returns:
        dict com suggested_response, confidence, has_action,
        operational_action, references, current_node
    """
    ticket_data = state.get("ticket_data", {})
    title = ticket_data.get("title", "")
    description = ticket_data.get("description", "")
    category = state.get("category", "general")
    priority = state.get("priority", "normal")
    intent = state.get("intent", "question")
    history = ticket_data.get("history", "")
    customer_name = ticket_data.get("customer_name", "Cliente")
    execution_id = state.get("execution_id")
    ticket_id = ticket_data.get("id") or state.get("ticket_id")

    # KB context from RAG
    rag_articles = state.get("rag_articles", [])
    kb_context = (
        "\n".join(
            f"[{i+1}] {a.get('title', '')}: {a.get('content', '')[:200]}..."
            for i, a in enumerate(rag_articles)
        )
        if rag_articles
        else "Sem artigos relevantes encontrados."
    )

    chain_inputs = {
        "title": title,
        "description": description,
        "category": category,
        "priority": priority,
        "intent": intent,
        "history": history or "Sem histórico.",
        "customer_name": customer_name,
        "knowledge_base_context": kb_context,
    }

    db = SessionLocal()
    try:
        callback = get_langfuse_callback()

        t0 = datetime.utcnow()

        if callback:
            result = get_suggestion_chain_with_handler().invoke(
                chain_inputs,
                config={"callbacks": [callback]},
            )
        else:
            result = get_suggestion_chain_with_handler().invoke(chain_inputs)

        latency_ms = int((datetime.utcnow() - t0).total_seconds() * 1000)

        # Normalize result to dict
        if hasattr(result, "model_dump"):
            result = result.model_dump()
        elif not isinstance(result, dict):
            result = dict(result)

        suggestion = {
            "response": result.get("response", ""),
            "confidence": float(result.get("confidence", 0.5)),
            "has_action": bool(result.get("has_action", False)),
            "operational_action": result.get("operational_action"),
            "references": result.get("references", []),
        }

        # Audit log
        if execution_id:
            try:
                audit = AIAuditLog(
                    id=uuid4(),
                    execution_id=execution_id,
                    node_name="suggest_response",
                    action="node_exited",
                    actor="ai",
                    details={
                        "confidence": suggestion["confidence"],
                        "has_action": suggestion["has_action"],
                        "latency_ms": latency_ms,
                    },
                    latency_ms=latency_ms,
                )
                db.add(audit)
                db.commit()
            except Exception as e:
                logger.warning(f"[suggest_response_node] audit log failed: {e}")
                db.rollback()

        return {
            "suggested_response": suggestion,
            "current_node": "suggest_response",
        }

    except Exception as e:
        logger.error(f"[suggest_response_node] failed: {e}")
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
        return {
            "suggested_response": suggestion,
            "current_node": "suggest_response",
        }

    finally:
        db.close()
