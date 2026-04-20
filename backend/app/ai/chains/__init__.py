# Chains module — LCEL-based LLM chains with LangFuse tracing
from app.ai.chains.classification import (
    ClassificationOutput,
    get_classification_chain,
    get_classification_chain_with_handler,
    invalidate_chain_cache as invalidate_classification_cache,
)
from app.ai.chains.suggestion import (
    SuggestionOutput,
    OperationalAction,
    ArticleReference,
    get_suggestion_chain,
    get_suggestion_chain_with_handler,
    invalidate_chain_cache as invalidate_suggestion_cache,
)
from app.ai.chains.escalation import (
    EscalationOutput,
    get_escalation_chain,
    get_escalation_chain_with_handler,
    get_escalation_prompt,
    get_agent_system_prompt,
    invalidate_chain_cache as invalidate_escalation_cache,
)
from app.ai.chains.registry import TemplateRegistry, render_template

__all__ = [
    # Registry
    "TemplateRegistry",
    "render_template",
    # Classification
    "ClassificationOutput",
    "get_classification_chain",
    "get_classification_chain_with_handler",
    "invalidate_classification_cache",
    # Suggestion
    "SuggestionOutput",
    "OperationalAction",
    "ArticleReference",
    "get_suggestion_chain",
    "get_suggestion_chain_with_handler",
    "invalidate_suggestion_cache",
    # Escalation
    "EscalationOutput",
    "get_escalation_chain",
    "get_escalation_chain_with_handler",
    "get_escalation_prompt",
    "get_agent_system_prompt",
    "invalidate_escalation_cache",
]
