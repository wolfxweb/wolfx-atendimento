"""
RAG Query Chain — lê o template da BD via registry.
"""
from app.ai.chains.registry import TemplateRegistry, render_template


def get_rag_query_prompt(query: str, context: str = "") -> str:
    """
    Obtém o prompt RAG query a partir do template activo na BD.
    """
    template = TemplateRegistry.get_template("rag_query")
    if not template:
        return f"Busca artigos relevantes para: {query}"

    return render_template(
        template.prompt_template,
        {"query": query, "context": context or ""}
    )
