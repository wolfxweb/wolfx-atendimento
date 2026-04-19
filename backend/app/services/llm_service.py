"""
LLM Service — Chat completion via OpenRouter using LangChain ChatOpenAI.

Usa ChatOpenAI (langchain-openai) que é OpenAI-compatible e funciona
transparente com OpenRouter. O CallbackHandler do LangFuse é injectado
automaticamente quando usado dentro de LCEL chains.

Retry com backoff exponencial via ChatOpenAI + timeout custom.
"""

import os
import json
import logging
from typing import Optional, Any

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ── Defaults via env ────────────────────────────────────────────────────────────
DEFAULT_MODEL: str = os.getenv("LLM_MODEL", "google/gemini-2.0-flash-exp")
DEFAULT_PROVIDER: str = "openrouter"
OPENROUTER_API_BASE: str = os.getenv("OPENROUTER_API_BASE", "https://openrouter.ai/api/v1")
OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENROUTER_API_TOKEN", "")
MAX_RETRIES: int = 5
INITIAL_BACKOFF: float = 3.0

# ── LangChain ChatOpenAI ───────────────────────────────────────────────────────


class LLMService:
    """
    Chat completion service via OpenRouter using LangChain ChatOpenAI.

    Mantém a mesma interface que o anterior (chat_complete, complete) para
    compatibilidade com o código existente. Internamente usa ChatOpenAI
    com tracing LangFuse automático via callback handler.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        api_base: Optional[str] = None,
    ):
        self.api_key = api_key or OPENROUTER_API_KEY
        self.model = model or DEFAULT_MODEL
        self.api_base = (api_base or OPENROUTER_API_BASE).rstrip("/")
        self._chat: Optional["ChatOpenAI"] = None

    @property
    def chat(self) -> "ChatOpenAI":
        """Lazy-load ChatOpenAI (langchain-openai)."""
        if self._chat is None:
            from langchain_openai import ChatOpenAI

            self._chat = ChatOpenAI(
                model=self.model,
                api_key=self.api_key,
                base_url=f"{self.api_base}/v1",
                timeout=120.0,
                max_retries=MAX_RETRIES,
                # OpenRouter specific headers
                http_headers={
                    "HTTP-Referer": "https://atendimento.wolfx.com.br",
                    "X-Title": "WolfX Atendimento",
                },
            )
        return self._chat

    def chat_complete(
        self,
        messages: list[dict],
        model: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 1024,
    ) -> dict:
        """
        Faz chat completion via ChatOpenAI (OpenRouter).

        Args:
            messages: [{"role": "system|user|assistant", "content": "..."}]
            model: override do modelo (usa default se None)
            temperature: 0.0-1.0
            max_tokens: limite de tokens na resposta

        Returns:
            {"content": str, "usage": dict, "model": str, "finish_reason": str}

        Raises:
            RuntimeError: após retries falharem
        """
        from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

        # Map messages dict → LangChain messages
        lc_messages = []
        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            if role == "system":
                lc_messages.append(SystemMessage(content=content))
            elif role == "assistant":
                lc_messages.append(AIMessage(content=content))
            else:
                lc_messages.append(HumanMessage(content=content))

        # Override model if needed (create new ChatOpenAI instance)
        if model and model != self.model:
            from langchain_openai import ChatOpenAI

            chat = ChatOpenAI(
                model=model,
                api_key=self.api_key,
                base_url=f"{self.api_base}/v1",
                temperature=temperature,
                max_tokens=max_tokens,
                timeout=120.0,
                max_retries=MAX_RETRIES,
                http_headers={
                    "HTTP-Referer": "https://atendimento.wolfx.com.br",
                    "X-Title": "WolfX Atendimento",
                },
            )
        else:
            chat = self.chat

        try:
            response = chat.invoke(lc_messages)

            # Extract usage from response metadata if available
            usage = {}
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                usage = {
                    "prompt_tokens": response.usage_metadata.get("input_tokens", 0),
                    "completion_tokens": response.usage_metadata.get("output_tokens", 0),
                    "total_tokens": response.usage_metadata.get("total_tokens", 0),
                }

            return {
                "content": response.content if hasattr(response, "content") else str(response),
                "usage": usage,
                "model": model or self.model,
                "finish_reason": "stop",
            }

        except Exception as exc:
            logger.error(f"[LLM] ChatOpenAI invoke failed: {exc}")
            raise RuntimeError(f"LLM chat completion failed: {exc}")

    def complete(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 1024,
    ) -> str:
        """
        Helper: prompt simples → texto.

        Args:
            prompt: texto do user
            system_prompt: texto do system (opcional)
            temperature: criatividade
            max_tokens: limite da resposta
        """
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        result = self.chat_complete(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return result["content"]


# ── Modelo activo da BD ───────────────────────────────────────────────────────


def _get_model_config_from_db(db: Session) -> tuple[str, str, str]:
    """
    Lê o modelo LLM default activo da BD.
    Returns: (model_name, provider, api_key)

    Se não encontrar nenhum, usa defaults das env vars.
    """
    try:
        from app.models.ai_models import AIModel

        model = db.query(AIModel).filter(
            AIModel.type == "llm",
            AIModel.is_active == True,
            AIModel.is_default == True,
        ).first()

        if not model:
            model = db.query(AIModel).filter(
                AIModel.type == "llm",
                AIModel.is_active == True,
            ).first()

        if model:
            return (
                model.model_id,
                model.provider or "openrouter",
                "",
            )
    except Exception as e:
        logger.warning(f"[LLM] Could not read model from DB: {e}")

    return (DEFAULT_MODEL, DEFAULT_PROVIDER, OPENROUTER_API_KEY)


# ── Singleton com cache ────────────────────────────────────────────────────────

_llm_cache: dict[str, LLMService] = {}
_llm_cache_key = ""


def get_llm_service(db: Optional[Session] = None) -> LLMService:
    """
    Retorna LLMService configurado.
    Lê da BD (AIModel default) se db for fornecido; caso contrário usa cache anterior.
    """
    global _llm_cache, _llm_cache_key

    cache_key = ""
    if db:
        model_name, provider, _ = _get_model_config_from_db(db)
        cache_key = f"{provider}:{model_name}"

    if cache_key and cache_key != _llm_cache_key:
        _, _, api_key = ("", "openrouter", OPENROUTER_API_KEY)
        if db:
            _, _, api_key = _get_model_config_from_db(db)

        model_name = DEFAULT_MODEL
        if db:
            model_name, _, _ = _get_model_config_from_db(db)

        _llm_cache[cache_key] = LLMService(
            api_key=api_key,
            model=model_name,
            api_base=OPENROUTER_API_BASE,
        )
        _llm_cache_key = cache_key

    if not _llm_cache:
        _llm_cache["default"] = LLMService()

    return _llm_cache.get(cache_key) or _llm_cache.get("default") or LLMService()


# ── Parse helpers ─────────────────────────────────────────────────────────────


def extract_json(text: str) -> dict | list | None:
    """
    Extrai JSON do texto retornado pelo LLM.
    Tenta find o primeiro bloco ```json ... ``` ou `` {...} ``.
    Fallback: texto directo.
    """
    import re

    text = text.strip()

    # Bloco ```json
    m = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass

    # Bloco ``` (sem json)
    m = re.search(r"```\s*(.*?)\s*```", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass

    # Raw JSON entre { }
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass

    # Raw JSON entre [ ]
    m = re.search(r"\[[\s\S]*\]", text)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass

    # Fallback: texto limpo
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    return None


def format_kb_context(chunks: list[dict]) -> str:
    """Formata resultados RAG como contexto para o prompt."""
    if not chunks:
        return "Sem artigos relevantes encontrados."
    parts = []
    for i, chunk in enumerate(chunks, 1):
        parts.append(
            f"[{i}] {chunk.get('content', '')[:300]}..."
        )
    return "\n".join(parts)
