"""
Classification LCEL Chain — LangChain + LangFuse.

Usa LCEL (|) para compor:
  PromptTemplate | ChatOpenAI | JsonOutputParser

O CallbackHandler do LangFuse é injetado automaticamente via config
quando o chain é invocado pelos nodes.
"""

import os
import logging
from typing import Literal
from pydantic import BaseModel, Field

from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import JsonOutputParser

logger = logging.getLogger(__name__)

# ── Model config ───────────────────────────────────────────────────────────────

OPENROUTER_API_BASE = os.getenv("OPENROUTER_API_BASE", "https://openrouter.ai/api/v1")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENROUTER_API_TOKEN", "")
DEFAULT_MODEL = os.getenv("LLM_MODEL", "google/gemini-2.0-flash-exp")


# ── Pydantic output schema ─────────────────────────────────────────────────────


class ClassificationOutput(BaseModel):
    """Schema Pydantic para output do chain de classificação."""

    priority: Literal["low", "normal", "high", "urgent"] = Field(
        description="Prioridade do ticket"
    )
    category: Literal[
        "billing", "technical", "general", "complaint", "feature_request"
    ] = Field(description="Categoria principal do ticket")
    intent: Literal[
        "question", "complaint", "request", "incident", "information"
    ] = Field(description="Intenção principal do cliente")
    language: str = Field(description="Língua do cliente (pt, en, es, ...)")
    summary: str = Field(description="Resumo curto do problema em 1-2 frases")
    confidence: float = Field(
        ge=0.0, le=1.0, description="Confiança da classificação 0.0-1.0"
    )
    reason: str = Field(description="Razão breve da classificação")


# ── LCEL Chain ─────────────────────────────────────────────────────────────────

_classification_chain = None


def get_classification_chain(
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 512,
):
    """
    Retorna o chain LCEL de classificação (singleton).

    Usage:
        result = classification_chain.invoke(
            {"title": "...", "description": "...", "history": "..."},
            config={"callbacks": [get_langfuse_callback()]}
        )
        # result = ClassificationOutput dict
    """
    global _classification_chain

    if _classification_chain is None:
        model = model or DEFAULT_MODEL

        prompt = PromptTemplate.from_template(
            """Eres un assistente AI de suporte ao cliente.

Classifica o ticket seguindo estas regras:

**Prioridade:**
- urgent: cliente VIP, palavra "urgente", problema crítico de negócio
- high: cliente pago, problema técnico grave ou reclamação
- normal: dúvida geral, pedido normal
- low: informação, sugestão, feedback

**Categoria:**
- billing: questões de pagamento, fatura, plano, cancelamento
- technical: erro, bug, problema técnico, configuração
- general: dúvida genérica, como fazer algo
- complaint: reclamação, insatisfação
- feature_request: sugestão de funcionalidade

**Intenção:**
- question: cliente faz uma pergunta
- complaint: cliente está insatisfeito
- request: cliente pede algo específico
- incident: reporta um problema/erro
- information: cliente dá informação

Título do ticket: {title}
Descrição: {description}
Histórico: {history}

Responde APENAS com JSON válido, sem texto extra.
""",
        )

        llm = ChatOpenAI(
            model=model,
            api_key=OPENROUTER_API_KEY,
            base_url=f"{OPENROUTER_API_BASE}/v1",
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=120.0,
            max_retries=3,
            http_headers={
                "HTTP-Referer": "https://atendimento.wolfx.com.br",
                "X-Title": "WolfX Atendimento",
            },
        )

        _classification_chain = prompt | llm | JsonOutputParser(
            pydantic_object=ClassificationOutput
        )

    return _classification_chain


def get_classification_chain_with_handler(
    model: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 512,
):
    """
    Retorna chain preparado para uso com LangFuse callback handler.
    O handler é injectado externamente via config={"callbacks": [...]}.
    """
    return get_classification_chain(model=model, temperature=temperature, max_tokens=max_tokens)


def invalidate_chain_cache():
    """Clear the singleton chain cache (useful for testing or config changes)."""
    global _classification_chain
    _classification_chain = None
