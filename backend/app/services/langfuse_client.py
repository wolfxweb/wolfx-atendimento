"""
LangFuse Integration — Observabilidade para o módulo AI.

Usa o callback handler do langfuse para tracing de traces LLM.
Compatível com o LLMService httpx custom (faz logging manual).

Ambiente:
    LANGFUSE_SECRET_KEY=sk-...
    LANGFUSE_PUBLIC_KEY=pk-...
    LANGFUSE_HOST=https://langfuse.celx.com.br   # self-hosted ou cloud
"""
import os
import logging
from typing import Optional, Any
from uuid import UUID

logger = logging.getLogger(__name__)

# ── LangFuse client (lazy init) ─────────────────────────────────

_langfuse = None
_langfuse_handler = None


def _get_langfuse():
    """Inicializa e retorna cliente LangFuse (singleton)."""
    global _langfuse

    if _langfuse is None:
        try:
            from langfuse import Langfuse
            _langfuse = Langfuse(
                secret_key=os.getenv("LANGFUSE_SECRET_KEY", ""),
                public_key=os.getenv("LANGFUSE_PUBLIC_KEY", ""),
                host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
            )
        except Exception as e:
            logger.warning(f"[LangFuse] Could not initialise: {e}")
            _langfuse = None

    return _langfuse


def get_langfuse_callback():
    """
    Retorna um langfuse CallbackHandler para LangChain.

    Usa com langchain-openai ChatOpenAI:
        from langfuse.callback import CallbackHandler
        handler = get_langfuse_callback()
        chat.invoke(messages, config={"callbacks": [handler]})
    """
    global _langfuse_handler

    if _langfuse_handler is None:
        lf = _get_langfuse()
        if lf is None:
            return None
        try:
            from langfuse.callback import CallbackHandler
            _langfuse_handler = CallbackHandler(client=lf)
        except Exception as e:
            # langchain não instalado — usa tracing manual via trace_llm_call
            if not isinstance(e, ModuleNotFoundError):
                logger.warning(f"[LangFuse] Could not create callback: {e}")
            _langfuse_handler = None

    return _langfuse_handler


# ── Tracing directo para LLMService httpx custom ────────────────

def trace_llm_call(
    operation: str,            # "classify", "suggest_response", "escalate"
    model: str,
    input_text: str,
    output_text: str,
    usage: dict,               # {prompt_tokens, completion_tokens, total_tokens}
    latency_ms: int,
    metadata: Optional[dict] = None,
    execution_id: Optional[UUID] = None,
    ticket_id: Optional[UUID] = None,
):
    """
    Regista um trace LLM manualmente no LangFuse.

    Usa a API de geração da LangFuse para traces directos.
    Alternativa: usar o CallbackHandler com LangChain.
    """
    lf = _get_langfuse()
    if lf is None:
        logger.warning("[LangFuse] lf is None — skipping trace")
        return

    try:
        metadata_combined = {
            "model": model,
            "execution_id": str(execution_id) if execution_id else None,
            "ticket_id": str(ticket_id) if ticket_id else None,
            "latency_ms": latency_ms,
            **(metadata or {}),
        }

        # LangFuse v2 API: lf.generation()
        # input/output devem ser string ou lista de mensagens
        generation = lf.generation(
            name=operation,
            model=model,
            input=input_text[:500],
            output=output_text[:500],
            modelParameters={"temperature": 0.3},
            usage={
                "prompt_tokens": usage.get("prompt_tokens", 0) or 0,
                "completion_tokens": usage.get("completion_tokens", 0) or 0,
                "total_tokens": usage.get("total_tokens", 0) or 0,
            },
            metadata=metadata_combined,
            level="DEFAULT",
        )
        lf.flush()
        logger.info(f"[LangFuse] traced {operation} → id={generation.id}")
        return generation

    except Exception as e:
        logger.warning(f"[LangFuse] trace_llm_call failed: {e}")


def flush():
    """Flush pending LangFuse events (chamar no fim do workflow)."""
    lf = _get_langfuse()
    if lf:
        try:
            lf.flush()
        except Exception:
            pass
