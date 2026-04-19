"""
Escalation LCEL Chain — LangChain + LangFuse.

Usa LCEL (|) para compor:
  PromptTemplate | ChatOpenAI | JsonOutputParser

O CallbackHandler do LangFuse é injectado via config.
"""

import os
import logging
from typing import Literal, Any
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


class EscalationOutput(BaseModel):
    should_escalate: bool = Field(description="Se deve escalar para agente humano")
    escalation_reason: str | None = Field(
        default=None, description="Razão da escalação ou null"
    )
    assign_to: str | None = Field(
        default=None, description="Equipa ou agente para escalar ou null"
    )
    priority_override: str | None = Field(
        default=None, description="Nova prioridade recomendada ou null"
    )


# ── LCEL Chain ─────────────────────────────────────────────────────────────────

_escalation_chain = None


def get_escalation_chain(
    model: str | None = None,
    temperature: float = 0.1,
    max_tokens: int = 256,
):
    """
    Retorna o chain LCEL de escalação (singleton).

    Usage:
        result = escalation_chain.invoke(
            {"title": "...", "description": "...", "category": "...", ...},
            config={"callbacks": [get_langfuse_callback()]}
        )
    """
    global _escalation_chain

    if _escalation_chain is None:
        model = model or DEFAULT_MODEL

        prompt = PromptTemplate.from_template(
            """Eres un assistente AI especializado em decisões de escalação de tickets.

Analisa o ticket e decide se deve ser escalado para um agente humano.

**Regras de escalação:**
- Escalar se: prioridade urgent/high, categoria complaint, sentiment negative
- Escalar se: envolve dinheiro, cancelamento, ou problema técnico grave
- NÃO escalar se: dúvida genérica com resposta clara na KB

Título: {title}
Descrição: {description}
Categoria: {category}
Prioridade actual: {priority}
Sentimento: {sentiment}

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

        _escalation_chain = prompt | llm | JsonOutputParser(
            pydantic_object=EscalationOutput
        )

    return _escalation_chain


def get_escalation_chain_with_handler(
    model: str | None = None,
    temperature: float = 0.1,
    max_tokens: int = 256,
):
    """Chain preparado para LangFuse callback via config."""
    return get_escalation_chain(model=model, temperature=temperature, max_tokens=max_tokens)


def invalidate_chain_cache():
    """Clear the singleton chain cache."""
    global _escalation_chain
    _escalation_chain = None


# ── Legacy helpers (mantidos para compatibilidade com código existente) ─────────


def get_escalation_prompt(
    title: str,
    description: str,
    category: str,
    priority: str,
    sentiment: str = "neutral",
) -> str:
    """Legacy: retorna string de prompt (para uso sem LCEL)."""
    return (
        f"Decide se este ticket deve ser escalado.\n\n"
        f"Título: {title}\nDescrição: {description}\n"
        f"Categoria: {category}\nPrioridade: {priority}\n"
        f"Sentimento: {sentiment}\n\n"
        "Responde JSON: should_escalate, escalation_reason, assign_to"
    )


def get_agent_system_prompt(language: str = "pt-BR") -> str:
    """Legacy: prompt de sistema do agente."""
    return (
        "Eres un asistente de soporte AI cortés y profesional. "
        f"Linguagem: {language}."
    )
