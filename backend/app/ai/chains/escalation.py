"""
Escalation Chain — lê o template da BD via registry.
"""
from app.ai.chains.registry import TemplateRegistry, render_template


def get_escalation_prompt(
    title: str,
    description: str,
    category: str,
    priority: str,
    sentiment: str = "neutral",
) -> str:
    """
    Obtém o prompt de escalação a partir do template activo na BD.
    """
    template = TemplateRegistry.get_template("escalation")
    if not template:
        return (
            f"Decide se este ticket deve ser escalado.\n\n"
            f"Título: {title}\nDescrição: {description}\n"
            f"Categoria: {category}\nPrioridade: {priority}\n"
            f"Sentimento: {sentiment}\n\n"
            "Responde JSON: should_escalate, escalation_reason, assign_to"
        )

    return render_template(
        template.prompt_template,
        {
            "title": title,
            "description": description,
            "category": category or "geral",
            "priority": priority or "normal",
            "sentiment": sentiment,
        }
    )


def get_agent_system_prompt(language: str = "pt-BR") -> str:
    """
    Obtém o prompt de sistema do agente a partir do template activo na BD.
    """
    template = TemplateRegistry.get_template("agent_system")
    if not template:
        return (
            "Eres un asistente de soporte AI cortés y profesional. "
            f"Linguagem: {language}."
        )

    return render_template(template.prompt_template, {"language": language})
