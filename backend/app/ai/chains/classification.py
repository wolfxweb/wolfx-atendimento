"""
Classification Chain — lê o template da BD via registry.
"""
from typing import Literal
from pydantic import BaseModel, Field
from app.ai.chains.registry import TemplateRegistry, render_template


class ClassificationOutput(BaseModel):
    priority: Literal["low", "normal", "high", "urgent"]
    category: str = Field(description="Categoria do ticket")
    intent: Literal["question", "problem", "request", "complaint", "refund", "feedback"]
    language: str = Field(description="Código ISO do idioma: pt-BR, en, es")
    summary: str = Field(description="Resumo em uma frase")
    confidence: float = Field(ge=0.0, le=1.0, description="Certeza da classificação")
    reason: str = Field(description="Justificativa curta")


def get_classification_variables(title: str, description: str, history: str = "") -> dict:
    """Prepara as variáveis para o template de classificação."""
    return {
        "title": title,
        "description": description,
        "history": history or "Sem histórico.",
    }


def get_classification_prompt(title: str, description: str, history: str = "") -> str:
    """
    Obtém o prompt de classificação a partir do template activo na BD.
    Retorna o texto do prompt já com as variáveis substituídas.
    """
    template = TemplateRegistry.get_template("classification")
    if not template:
        # Fallback hardcoded mínimo
        return (
            f"Classifica o ticket.\n\nTítulo: {title}\n"
            f"Descrição: {description}\n\n"
            "Responde com JSON: priority, category, intent, language, summary, confidence, reason."
        )

    prompt_text = render_template(
        template.prompt_template,
        {"title": title, "description": description, "history": history or "Sem histórico."}
    )
    return prompt_text


def get_classification_output_schema() -> type[BaseModel]:
    """Retorna o schema Pydantic para parsing do output."""
    return ClassificationOutput
