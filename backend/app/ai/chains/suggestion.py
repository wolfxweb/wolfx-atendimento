"""
Suggestion LCEL Chain — LangChain + LangFuse.

Usa LCEL (|) para compor:
  PromptTemplate | ChatOpenAI | JsonOutputParser

O CallbackHandler do LangFuse é injetado automaticamente via config.
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


class OperationalAction(BaseModel):
    type: Literal["update_field", "notify", "escalate"] = Field(
        description="Tipo de acção operacional"
    )
    details: str = Field(description="Detalhes da acção")


class ArticleReference(BaseModel):
    article_id: str = Field(description="ID do artigo referenciado")
    title: str = Field(description="Título do artigo")


class SuggestionOutput(BaseModel):
    response: str = Field(description="Texto da resposta sugerida ao cliente")
    confidence: float = Field(ge=0.0, le=1.0, description="Confiança 0.0-1.0")
    has_action: bool = Field(description="Se há acção operacional associada")
    operational_action: OperationalAction | None = Field(
        default=None, description="Acção operacional a executar"
    )
    references: list[ArticleReference] = Field(
        default_factory=list, description="Artigos KB referenciados"
    )


# ── LCEL Chain ─────────────────────────────────────────────────────────────────

_suggestion_chain = None


def get_suggestion_chain(
    model: str | None = None,
    temperature: float = 0.4,
    max_tokens: int = 1024,
):
    """
    Retorna o chain LCEL de sugestão de resposta (singleton).

    Usage:
        result = suggestion_chain.invoke(
            {"title": "...", "description": "...", ...},
            config={"callbacks": [get_langfuse_callback()]}
        )
    """
    global _suggestion_chain

    if _suggestion_chain is None:
        model = model or DEFAULT_MODEL

        prompt = PromptTemplate.from_template(
            """Eres un assistente AI de suporte ao cliente.

Com base na informação do ticket e nos artigos da base de conhecimento (KB),
gera uma sugestão de resposta para o agente de suporte.

**Regras:**
- Responde de forma útil, amigável e profissional
- Se houver artigo KB relevante, usa-o como referência
- Se for preciso escalar, indica no campo has_action=true
- Formato JSON obrigatório

Cliente: {customer_name}
Prioridade: {priority}
Categoria: {category}
Intenção: {intent}

Título do ticket: {title}
Descrição: {description}
Histórico: {history}

Artigos KB relevantes:
{knowledge_base_context}

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

        _suggestion_chain = prompt | llm | JsonOutputParser(
            pydantic_object=SuggestionOutput
        )

    return _suggestion_chain


def get_suggestion_chain_with_handler(
    model: str | None = None,
    temperature: float = 0.4,
    max_tokens: int = 1024,
):
    """Chain preparado para LangFuse callback via config."""
    return get_suggestion_chain(model=model, temperature=temperature, max_tokens=max_tokens)


def invalidate_chain_cache():
    """Clear the singleton chain cache."""
    global _suggestion_chain
    _suggestion_chain = None
