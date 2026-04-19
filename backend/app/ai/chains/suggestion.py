"""
Suggestion Chain — lê o template da BD via registry.
"""
from app.ai.chains.registry import TemplateRegistry, render_template


def get_suggestion_variables(
    title: str,
    description: str,
    category: str,
    priority: str,
    knowledge_base_context: str,
    customer_name: str = "Cliente",
    intent: str = "",
    history: str = "",
) -> dict:
    """Prepara as variáveis para o template de sugestão."""
    return {
        "title": title,
        "description": description,
        "category": category or "geral",
        "priority": priority or "normal",
        "knowledge_base_context": knowledge_base_context or "Sem artigos disponíveis.",
        "customer_name": customer_name,
        "intent": intent,
        "history": history or "Sem histórico.",
    }


def get_suggestion_prompt(
    title: str,
    description: str,
    category: str,
    priority: str,
    knowledge_base_context: str,
    customer_name: str = "Cliente",
    intent: str = "",
    history: str = "",
) -> str:
    """
    Obtém o prompt de sugestão a partir do template activo na BD.
    """
    template = TemplateRegistry.get_template("suggestion")
    if not template:
        return (
            f"Gera uma sugestão de resposta para o ticket.\n\n"
            f"Cliente: {customer_name}\nPrioridade: {priority}\n"
            f"Categoria: {category}\n\nTicket:\nTítulo: {title}\n"
            f"Descrição: {description}\n\nArtigos KB:\n{knowledge_base_context}"
        )

    return render_template(
        template.prompt_template,
        get_suggestion_variables(
            title, description, category, priority,
            knowledge_base_context, customer_name, intent, history
        )
    )
