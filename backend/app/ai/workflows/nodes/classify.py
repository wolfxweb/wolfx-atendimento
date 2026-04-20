"""
Classify Node — Classification via LCEL chain + LangFuse callback.

Usa o chain LangChain (PromptTemplate | ChatOpenAI | JsonOutputParser)
com LangFuse CallbackHandler para tracing automático.
"""

import logging
from datetime import datetime
from uuid import uuid4
from typing import Any

from app.database import SessionLocal
from app.models.ai_models import AIAuditLog
from app.services.langfuse_client import trace_llm_call
from app.ai.chains.classification import (
    get_classification_chain_with_handler,
    ClassificationOutput,
)
from app.ai.chains.registry import TemplateRegistry, render_template

logger = logging.getLogger(__name__)


def classify_node(state: dict[str, Any]) -> dict[str, Any]:
    """
    Node de classificação de ticket.

    1. Obtém template 'classification' da BD
    2. Invoca LCEL chain (com LangFuse callback)
    3. Guarda resultado em state
    4. Audit log

    Returns:
        dict com classification_output, priority, category, intent,
        confidence, current_node
    """
    ticket_data = state.get("ticket_data", {})
    title = ticket_data.get("title", state.get("title", ""))
    description = ticket_data.get("description", state.get("description", ""))
    history = ticket_data.get("history", state.get("history", ""))
    execution_id = state.get("execution_id")
    ticket_id = ticket_data.get("id") or state.get("ticket_id")

    # Obter template de classification da BD (para contexto adicional)
    db = SessionLocal()
    try:
        template = TemplateRegistry.get_template("classification")
        extra_context = ""
        if template:
            extra_context = render_template(
                template.prompt_template,
                {"title": title, "description": description, "history": history},
            )

        # Preparar inputs para o chain
        chain_inputs = {
            "title": title,
            "description": description,
            "history": history or "Sem histórico",
        }

        # Invocar LCEL chain (sem callback — tracing feito via trace_llm_call)
        t0 = datetime.utcnow()
        result = get_classification_chain_with_handler().invoke(chain_inputs)

        latency_ms = int((datetime.utcnow() - t0).total_seconds() * 1000)

        # result é ClassificationOutput (dict Pydantic)
        classification_output = (
            result
            if isinstance(result, dict)
            else result.model_dump() if hasattr(result, "model_dump") else result
        )

        # Tracing LangFuse (sem langchain — via SDK manual)
        try:
            from app.ai.chains.classification import DEFAULT_MODEL
            trace_llm_call(
                operation="classify",
                model=DEFAULT_MODEL,
                input_text=f"{title}\n{description}",
                output_text=str(classification_output),
                usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
                latency_ms=latency_ms,
                metadata={
                    "intent": classification_output.get("intent"),
                    "confidence": classification_output.get("confidence"),
                },
                execution_id=execution_id,
                ticket_id=ticket_id,
            )
        except Exception as e:
            logger.warning(f"[classify_node] LangFuse trace failed: {e}")

        # Audit log
        if execution_id:
            try:
                audit = AIAuditLog(
                    id=uuid4(),
                    execution_id=execution_id,
                    node_name="classify",
                    action="node_exited",
                    actor="ai",
                    details={
                        "category": classification_output.get("category"),
                        "priority": classification_output.get("priority"),
                        "confidence": classification_output.get("confidence"),
                        "latency_ms": latency_ms,
                    },
                    latency_ms=latency_ms,
                )
                db.add(audit)
                db.commit()
            except Exception as e:
                logger.warning(f"[classify_node] audit log failed: {e}")
                db.rollback()

        return {
            "classification": classification_output,
            "priority": classification_output.get("priority", "normal"),
            "category": classification_output.get("category", "general"),
            "intent": classification_output.get("intent", "question"),
            "language": classification_output.get("language", "pt"),
            "summary": classification_output.get("summary", ""),
            "confidence": float(classification_output.get("confidence", 0.5)),
            "reason": classification_output.get("reason", ""),
            "current_node": "classify",
        }

    except Exception as e:
        logger.error(f"[classify_node] classification failed: {e}")

        # Fallback em caso de erro
        return {
            "classification": {
                "priority": "normal",
                "category": "general",
                "intent": "question",
                "language": "pt",
                "summary": title[:200],
                "confidence": 0.0,
                "reason": f"Erro na classificação: {str(e)[:100]}",
            },
            "priority": "normal",
            "category": "general",
            "intent": "question",
            "language": "pt",
            "summary": title[:200],
            "confidence": 0.0,
            "reason": f"Erro: {str(e)[:100]}",
            "current_node": "classify",
        }

    finally:
        db.close()
