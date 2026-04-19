"""
LLM Service — Chat completion via OpenRouter (OpenAI-compatible API).

Usa o modelo configurado na tabela AIModel (is_default + is_active + type='llm').
Se não houver modelo na BD, usa fallback via variável de ambiente.

Retry com backoff exponencial para rate limits e erros transitórios.
"""

import os
import json
import logging
import time
from typing import Optional, Any

import httpx
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ── Defaults via env ────────────────────────────────────────────────────────────
DEFAULT_MODEL: str = os.getenv("LLM_MODEL", "google/gemini-2.0-flash-exp")
DEFAULT_PROVIDER: str = "openrouter"
OPENROUTER_API_BASE: str = os.getenv("OPENROUTER_API_BASE", "https://openrouter.ai/api/v1")
OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENROUTER_API_TOKEN", "")
MAX_RETRIES: int = 5
INITIAL_BACKOFF: float = 3.0

# ── OpenAI-compatible Chat Completion ─────────────────────────────────────────

class LLMService:
    """
    Chat completion service via OpenRouter (OpenAI-compatible).
    Suporta modelos tipo 'llm' configurados na tabela AIModel.
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
        self._session: Optional[httpx.Client] = None

    def _client(self) -> httpx.Client:
        if self._session is None:
            self._session = httpx.Client(timeout=120.0)
        return self._session

    def __del__(self):
        if self._session:
            self._session.close()

    def chat_complete(
        self,
        messages: list[dict],
        model: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 1024,
        retry_count: int = MAX_RETRIES,
    ) -> dict:
        """
        Faz chat completion via OpenRouter API.

        Args:
            messages: [{"role": "system|user|assistant", "content": "..."}]
            model: override do modelo (usa default se None)
            temperature: 0.0-1.0 (baixo = mais determinístico)
            max_tokens: limite de tokens na resposta
            retry_count: número de tentativas

        Returns:
            {"content": str, "usage": dict, "model": str, "finish_reason": str}

        Raises:
            RuntimeError: após todos os retries falharem
        """
        url = f"{self.api_base}/chat/completions"
        model = model or self.model
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://atendimento.wolfx.com.br",
            "X-Title": "WolfX Atendimento",
        }
        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        last_exc: Exception | None = None
        for attempt in range(retry_count):
            try:
                resp = self._client().post(url, headers=headers, json=payload)

                if resp.status_code == 429:
                    backoff = INITIAL_BACKOFF * (2 ** attempt)
                    logger.warning(
                        f"[LLM] OpenRouter HTTP 429, backing off {backoff}s "
                        f"(attempt {attempt + 1}/{retry_count})"
                    )
                    time.sleep(backoff)
                    continue

                if resp.status_code in (500, 502, 503, 504):
                    backoff = INITIAL_BACKOFF * (2 ** attempt)
                    logger.warning(
                        f"[LLM] OpenRouter HTTP {resp.status_code}, backing off {backoff}s "
                        f"(attempt {attempt + 1}/{retry_count})"
                    )
                    time.sleep(backoff)
                    continue

                if resp.status_code == 400:
                    logger.error(f"[LLM] OpenRouter 400: {resp.text[:500]}")
                resp.raise_for_status()
                data = resp.json()

                choice = data["choices"][0]
                finish_reason = choice.get("finish_reason", "stop")
                content = choice.get("message", {}).get("content", "")

                if not content:
                    if finish_reason == "length":
                        logger.warning("[LLM] Response truncated (max_tokens reached)")
                        content = choice.get("message", {}).get("content", "")

                return {
                    "content": content,
                    "usage": data.get("usage", {}),
                    "model": data.get("model", model),
                    "finish_reason": finish_reason,
                }

            except (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout,
                    httpx.RemoteProtocolError, httpx.PoolTimeout,
                    httpx.ConnectTimeout, httpx.HTTPStatusError) as exc:
                backoff = INITIAL_BACKOFF * (2 ** attempt)
                logger.warning(
                    f"[LLM] Connection error ({type(exc).__name__}), "
                    f"backing off {backoff}s (attempt {attempt + 1}/{retry_count})"
                )
                time.sleep(backoff)
                last_exc = exc
                continue

        raise RuntimeError(
            f"LLM chat completion failed after {retry_count} retries: "
            f"{type(last_exc).__name__ if last_exc else 'unknown'}"
        )

    def complete(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 1024,
    ) -> str:
        """
        Helpers: prompt simples → texto.

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
            # Qualquer modelo LLM activo
            model = db.query(AIModel).filter(
                AIModel.type == "llm",
                AIModel.is_active == True,
            ).first()

        if model:
            return (
                model.model_id,  # Use actual model_id (e.g. "openai/gpt-4o-mini"), NOT display name
                model.provider or "openrouter",
                "",  # api_key_ref → vars de ambiente, não guardadas em claro
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
        # Need API key from env based on provider
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
    text = text.strip()

    # Bloco ```json
    import re
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
