"""
RAG Lookup Node — busca artigos KB por similaridade de embeddings.
"""
from typing import Any
from app.services.embedding_service import search_similar_chunks
from app.database import SessionLocal


def rag_lookup_node(state: dict[str, Any]) -> dict[str, Any]:
    """
    Busca artigos KB relevantes para o ticket.

    Usa embeddings MiniMax via embedding_service.search_similar_chunks.
    O resultado é guardado em state['rag_articles'] e state['kb_context'].
    """
    ticket_data = state.get("ticket_data", {})
    title = ticket_data.get("title", state.get("title", ""))
    description = ticket_data.get("description", state.get("description", ""))

    query = f"{title} {description}"[:500]

    db = SessionLocal()
    try:
        chunks = search_similar_chunks(
            db=db,
            query=query,
            top_k=5,
            min_similarity=0.3,
        )
        articles = [
            {
                "id": str(c.get("id", "")),
                "title": c.get("title", "")[:200],
                "content": c.get("content", "")[:500],
                "score": float(c.get("score", 0.0)),
            }
            for c in chunks
        ]
        kb_context = "\n".join(
            f"[{i+1}] {a['title']}: {a['content'][:200]}..."
            for i, a in enumerate(articles)
        ) if articles else "Sem artigos relevantes encontrados."

    except Exception as e:
        articles = []
        kb_context = f"Erro ao buscar KB: {str(e)[:100]}"

    finally:
        db.close()

    return {
        "rag_articles": articles,
        "kb_context": kb_context,
        "current_node": "rag_lookup",
    }
