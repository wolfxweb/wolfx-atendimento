"""
Embedding service using LangChain + OpenRouter for RAG semantic search.

Uses langchain-openai OpenAIEmbeddings which is OpenAI-compatible with OpenRouter.
Model: openai/text-embedding-3-small (dim=1536)

LangChain OpenAIEmbeddings handles:
- OpenAI-compatible API calls to OpenRouter
- Automatic retries and backoff
- Batch embedding with pagination
"""

import os
import logging
import math
from typing import Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "openai/text-embedding-3-small")
EMBEDDING_DIM = 1536   # text-embedding-3-small → 1536 dimensions
OPENROUTER_API_BASE = os.getenv("OPENROUTER_API_BASE", "https://openrouter.ai/api/v1")
CHUNK_SIZE = 500       # characters per chunk
CHUNK_OVERLAP = 50     # overlap between chunks


# ── LangChain OpenAI Embeddings (OpenRouter-compatible) ───────────────────────


def _get_api_key() -> str:
    key = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENROUTER_API_TOKEN")
    if not key:
        raise ValueError("OPENROUTER_API_KEY environment variable is not set")
    return key


class _OpenRouterEmbeddings:
    """
    LangChain OpenAIEmbeddings wrapper for OpenRouter.

    Uses langchain-openai OpenAIEmbeddings which handles:
    - OpenAI-compatible API calls to OpenRouter /embeddings endpoint
    - Automatic retries with exponential backoff
    - Batch embedding with pagination
    - Timeout management
    """

    def __init__(
        self,
        api_key: str,
        model: str = EMBEDDING_MODEL,
        api_base: str = OPENROUTER_API_BASE,
    ):
        from langchain_openai import OpenAIEmbeddings

        self._embeddings = OpenAIEmbeddings(
            model=model,
            api_key=api_key,
            base_url=api_base.rstrip("/"),
            timeout=60.0,
            max_retries=5,
            default_headers={
                "HTTP-Referer": "https://atendimento.wolfx.com.br",
                "X-Title": "WolfX Atendimento",
            },
        )

    def embed_query(self, text: str) -> list[float]:
        """Embed a single query string."""
        return self._embeddings.embed_query(text[:8192])

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of documents."""
        # LangChain OpenAIEmbeddings handles batching internally
        return self._embeddings.embed_documents([t[:8192] for t in texts])


# ── Singleton ─────────────────────────────────────────────────────────────────

_instance: Optional[_OpenRouterEmbeddings] = None


def get_embeddings() -> _OpenRouterEmbeddings:
    """Cached singleton."""
    global _instance
    if _instance is None:
        _instance = _OpenRouterEmbeddings(api_key=_get_api_key())
    return _instance


# ── Chunking ──────────────────────────────────────────────────────────────────
def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Segment text into overlapping chunks of ~chunk_size characters."""
    if not text or len(text.strip()) < 50:
        return []
    chunks = []
    text = text.strip()
    step = chunk_size - overlap
    for i in range(0, len(text), step):
        chunk = text[i:i + chunk_size]
        if len(chunk.strip()) > 50:
            chunks.append(chunk.strip())
    return chunks


# ── PDF Extraction ────────────────────────────────────────────────────────────
def extract_pdf_text(file_path: str) -> str:
    """Extract text from a PDF using pdfplumber."""
    try:
        import pdfplumber
    except ImportError:
        logger.warning("pdfplumber not installed — PDF text extraction unavailable")
        return ""
    try:
        with pdfplumber.open(file_path) as pdf:
            pages = [p.extract_text() for p in pdf.pages if p.extract_text()]
        return "\n\n".join(pages)
    except Exception as e:
        logger.error(f"PDF extraction failed for {file_path}: {e}")
        return ""


# ── Vector Math ───────────────────────────────────────────────────────────────
def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Pure-Python cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


# ── RAG Indexing ─────────────────────────────────────────────────────────────
def index_article(db: Session, article_id: str) -> dict:
    """
    Index a KB article: body text + PDF attachments → chunks → embeddings → DB.

    Pipeline:
      1. Load KBArticle with attachments
      2. Delete existing ai_embeddings for this article (re-index = full replace)
      3. Extract & chunk body text
      4. For each PDF attachment: extract text & chunk
      5. Generate embeddings via OpenRouter
      6. Store in ai_embeddings table
    """
    from app.models.models import AIEmbedding, KBArticle

    model = get_embeddings()

    article = db.query(KBArticle).filter(KBArticle.id == article_id).first()
    if not article:
        raise ValueError(f"KBArticle {article_id} not found")

    # Clear old embeddings (full re-index)
    db.query(AIEmbedding).filter(AIEmbedding.article_id == article_id).delete()
    db.commit()

    chunks: list[tuple[str, Optional[str], int, str, dict]] = []

    # Body text chunks
    for idx, chunk in enumerate(chunk_text(article.content or "")):
        chunks.append(("article_body", None, idx, chunk, {}))

    # PDF attachment chunks
    for att in article.attachments:
        if att.mime_type and att.mime_type.startswith("application/pdf"):
            if att.file_path and os.path.exists(att.file_path):
                pdf_text = extract_pdf_text(att.file_path)
                offset = len(chunks)
                for idx, chunk in enumerate(chunk_text(pdf_text)):
                    meta = {"filename": att.original_name, "attachment_id": str(att.id)}
                    chunks.append(("article_attachment", att.id, offset + idx, chunk, meta))

    # Batch embed & store
    stored = errors = 0
    texts_to_embed = [c[3] for c in chunks]

    if texts_to_embed:
        try:
            vectors = model.embed_documents(texts_to_embed)
        except Exception as e:
            logger.error(f"[RAG] Batch embedding failed for article {article_id}: {e}")
            try:
                article.embedding_status = "failed"
                db.commit()
            except Exception:
                pass
            raise

        for i, (source_type, source_id, chunk_idx, content, metadata) in enumerate(chunks):
            emb = AIEmbedding(
                article_id=article_id,
                source_type=source_type,
                source_id=source_id,
                chunk_index=chunk_idx,
                content_chunk=content,
                embedding=vectors[i],
                chunk_metadata=metadata,
            )
            db.add(emb)
            stored += 1

    db.commit()
    article.embedding_status = "indexed"
    article.chunk_count = stored
    db.commit()
    logger.info(f"[RAG] Indexed article {article_id}: {stored} chunks stored")
    return {"article_id": article_id, "chunks_stored": stored, "errors": errors}


def index_rag_document(db: Session, rag_document_id: str) -> dict:
    """
    Index a standalone AIRagDocument PDF: extract text → chunk → embed → store.

    Pipeline:
      1. Load AIRagDocument
      2. Delete existing ai_rag_chunks for this document (re-index = full replace)
      3. Extract & chunk PDF text
      4. Generate embeddings via OpenRouter
      5. Store in ai_rag_chunks table
      6. Update AIRagDocument status
    """
    from app.models.models import AIRagDocument, AIRagChunk
    from datetime import datetime

    model = get_embeddings()

    doc = db.query(AIRagDocument).filter(AIRagDocument.id == rag_document_id).first()
    if not doc:
        raise ValueError(f"AIRagDocument {rag_document_id} not found")

    # Mark as processing
    doc.status = "processing"
    doc.error_message = None
    db.commit()

    try:
        # Clear old chunks (full re-index)
        db.query(AIRagChunk).filter(AIRagChunk.rag_document_id == rag_document_id).delete()

        # Extract PDF text
        if not os.path.exists(doc.file_path):
            raise FileNotFoundError(f"File not found: {doc.file_path}")

        pdf_text = extract_pdf_text(doc.file_path)
        if not pdf_text:
            raise ValueError("No text extracted from PDF")

        # Chunk
        chunks = chunk_text(pdf_text)
        if not chunks:
            raise ValueError("No valid chunks produced from PDF text")

        # Batch embed & store
        vectors = model.embed_documents(chunks)
        stored = 0
        for idx, (chunk_text_content, vector) in enumerate(zip(chunks, vectors)):
            chunk = AIRagChunk(
                rag_document_id=rag_document_id,
                chunk_index=idx,
                content_chunk=chunk_text_content,
                embedding=vector,
                chunk_metadata={"filename": doc.original_filename},
            )
            db.add(chunk)
            stored += 1

        # Update document status
        doc.status = "indexed"
        doc.chunk_count = stored
        doc.embedded_at = datetime.utcnow()
        db.commit()

        logger.info(f"[RAG] Indexed document {rag_document_id}: {stored} chunks stored")
        return {"rag_document_id": rag_document_id, "chunks_stored": stored}

    except Exception as e:
        doc.status = "failed"
        doc.error_message = str(e)
        db.commit()
        logger.error(f"[RAG] Document indexing failed for {rag_document_id}: {e}")
        raise


def search_similar_chunks(
    db: Session,
    query: str,
    article_ids: list[str] = None,
    rag_document_ids: list[str] = None,
    top_k: int = 5,
    min_similarity: float = 0.3,
) -> list[dict]:
    """
    RAG semantic search:
      1. Embed query via OpenRouter
      2. Fetch candidate chunks (optionally filtered by article_ids or rag_document_ids)
      3. Compute cosine similarity in Python
      4. Return top_k results above threshold
    """
    from app.models.models import AIEmbedding, AIRagChunk, AIRagDocument

    model = get_embeddings()
    query_vector = model.embed_query(query)

    results: list[dict] = []

    # Search KB article embeddings
    if article_ids is None or article_ids:
        q = db.query(AIEmbedding)
        if article_ids:
            q = q.filter(AIEmbedding.article_id.in_(article_ids))

        for chunk in q.all():
            if chunk.embedding:
                sim = cosine_similarity(query_vector, chunk.embedding)
                if sim >= min_similarity:
                    results.append({
                        "article_id": str(chunk.article_id),
                        "rag_document_id": None,
                        "source_type": chunk.source_type,
                        "source_id": str(chunk.source_id) if chunk.source_id else None,
                        "chunk_index": chunk.chunk_index,
                        "content": chunk.content_chunk,
                        "similarity": round(sim, 4),
                        "metadata": chunk.chunk_metadata,
                    })

    # Search standalone RAG document chunks
    if rag_document_ids is None or rag_document_ids:
        q = db.query(AIRagChunk)
        if rag_document_ids:
            q = q.filter(AIRagChunk.rag_document_id.in_(rag_document_ids))

        for chunk in q.all():
            if chunk.embedding:
                sim = cosine_similarity(query_vector, chunk.embedding)
                if sim >= min_similarity:
                    results.append({
                        "article_id": None,
                        "rag_document_id": str(chunk.rag_document_id),
                        "source_type": "rag_document",
                        "source_id": str(chunk.id),
                        "chunk_index": chunk.chunk_index,
                        "content": chunk.content_chunk,
                        "similarity": round(sim, 4),
                        "metadata": chunk.chunk_metadata,
                    })

    # Sort by similarity and return top_k
    results.sort(key=lambda x: x["similarity"], reverse=True)
    return results[:top_k]


def delete_article_embeddings(db: Session, article_id: str) -> int:
    """Delete all embeddings for an article. Returns count of deleted rows."""
    from app.models.models import AIEmbedding
    count = db.query(AIEmbedding).filter(AIEmbedding.article_id == article_id).delete()
    db.commit()
    return count
