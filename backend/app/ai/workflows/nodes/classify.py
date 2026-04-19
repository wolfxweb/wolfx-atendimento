"""
Classify Node — classifica ticket usando OpenRouter como motor de LLM.

Todas as regras de negócio (threshold, condições) são código Python.
"""
from typing import Any
from datetime import datetime
from uuid import uuid4
from app.ai.chains.classification import get_classification_prompt
from app.ai.chains.registry import TemplateRegistry
from app.services.llm_service import get_llm_service, extract_json
from app.services.langfuse_client import trace_llm_call
from app.database import SessionLocal
from app.models.ai_models import AIAuditLog


def classify_node(state: dict[str, Any]) -> dict[str, Any]:
    """
    Node de classificação de ticket.

    Lê template 'classification' da BD → prompt → LLM → parse JSON →
    aplica regras Python → guarda em state.
    """
    ticket_data = state.get("ticket_data", {})
    title = ticket_data.get("title", "")
    description = ticket_data.get("description", "")
    history = ticket_data.get("history", "")
    ticket_id = ticket_data.get("id") or state.get("ticket_id")
    execution_id = state.get("execution_id")

    # Obter prompt do template da BD
    prompt = get_classification_prompt(title, description, history)

    system_prompt = (
        "Eres un assistente AI especializado em classificação de tickets de suporte. "
        "Respondes APENAS com JSON válido, sem texto extra. "
        '{"priority": "low|normal|high|urgent", "category": "...", '
        '"intent": "question|problem|request|complaint|refund|feedback", '
        '"language": "pt-BR|en|es", "summary": "...", "confidence": 0.0-1.0, "reason": "..."}'
    )

    db = SessionLocal()
    try:
        llm = get_llm_service(db)

        t0 = datetime.utcnow()
        response = llm.complete(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=0.2,
            max_tokens=512,
        )
        latency_ms = int((datetime.utcnow() - t0).total_seconds() * 1000)

        parsed = extract_json(response)

        if parsed and isinstance(parsed, dict):
            classification = {
                "priority": parsed.get("priority", "normal"),
                "category": parsed.get("category", "geral"),
                "intent": parsed.get("intent", "question"),
                "language": parsed.get("language", "pt-BR"),
                "summary": parsed.get("summary", title[:100]),
                "confidence": float(parsed.get("confidence", 0.5)),
                "reason": parsed.get("reason", ""),
            }
        else:
            classification = {
                "priority": "normal",
                "category": "geral",
                "intent": "question",
                "language": "pt-BR",
                "summary": title[:100],
                "confidence": 0.0,
                "reason": "LLM response parsing failed",
            }

        # Trace LangFuse
        trace_llm_call(
            operation="classify",
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
                    node_name="classify",
                    action="node_exited",
                    actor="ai",
                    details={"classification": classification},
                    latency_ms=latency_ms,
                )
                db.add(audit)
                db.commit()
            except Exception:
                db.rollback()

    except Exception as e:
        classification = {
            "priority": "normal",
            "category": "geral",
            "intent": "question",
            "language": "pt-BR",
            "summary": title[:100],
            "confidence": 0.0,
            "reason": f"Error: {str(e)[:100]}",
        }
    finally:
        db.close()

    # Invalida cache de templates
    TemplateRegistry.invalidate()

    return {
        "classification": classification,
        "priority": classification["priority"],
        "category": classification["category"],
        "intent": classification["intent"],
        "language": classification["language"],
        "current_node": "classify",
    }
