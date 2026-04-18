"""
Embedding service using LangChain-compatible custom embeddings for MiniMax.

Reference: AI_MODULE_PLAN.md section 4.5
Model: minimaxi/e5-embedding-02 (dim=1024)

MiniMax e5-embedding-02 uses a non-standard OpenAI-compatible API:
  - Field: "texts" (array) instead of "input" (string)
  - Field: "type" required ("query" or "db")

We implement a LangChain-compatible Embeddings class that handles the correct
request/response format, so the rest of the pipeline stays provider-agnostic.
"""

import os
import logging
import time
from typing import Optional

import httpx
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "minimaxi/e5-embedding-02")
EMBEDDING_DIM = 1024   # MiniMax e5-embedding-02 → 1024 dimensions
EMBEDDING_API_BASE = os.getenv("MINIMAX_BASE_URL", "https://api.minimax.io/v1")
CHUNK_SIZE = 500       # characters per chunk
CHUNK_OVERLAP = 50     # overlap between chunks
MAX_RETRIES = 5        # total retry attempts per batch
INITIAL_BACKOFF = 5    # seconds


# ── MiniMax Embeddings (LangChain-compatible) ─────────────────────────────────
class MiniMaxEmbeddings:
    """
    LangChain-compatible embeddings class for MiniMax e5-embedding-02.

    Implements embed_query / embed_documents so it can replace
    langchain_openai.OpenAIEmbeddings in the pipeline.
    Uses synchronous HTTP calls with retry + exponential backoff for rate limits.
    """

    def __init__(self, api_key: str, model: str = EMBEDDING_MODEL,
                 api_base: str = EMBEDDING_API_BASE):
        self.api_key = api_key
        self.model = model
        self.api_base = api_base.rstrip("/")
        self._session: Optional[httpx.Client] = None

    def _client(self) -> httpx.Client:
        if self._session is None:
            self._session = httpx.Client(timeout=60.0)
        return self._session

    def __del__(self):
        if self._session:
            self._session.close()

    def _post(self, texts: list[str], embedding_type: str) -> list[list[float]]:
        """Make a MiniMax embedding API call with retry on rate limit / 5xx / network errors."""
        url = f"{self.api_base}/embeddings"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "texts": texts,
            "type": embedding_type,
        }
        last_exc = None
        for attempt in range(MAX_RETRIES):
            try:
                resp = self._client().post(url, headers=headers, json=payload)

                # HTTP-level rate limit or unavailable
                if resp.status_code in (429, 503):
                    backoff = INITIAL_BACKOFF * (2 ** attempt)
                    logger.warning(
                        f"[RAG] MiniMax HTTP {resp.status_code}, backing off {backoff}s "
                        f"(attempt {attempt+1}/{MAX_RETRIES})"
                    )
                    time.sleep(backoff)
                    continue

                resp.raise_for_status()
                data = resp.json()

                # API-level status codes (MiniMax uses base_resp.status_code)
                base_resp = data.get("base_resp", {})
                status_code = base_resp.get("status_code", 0)
                if status_code in (1002, 1004, 1010):
                    backoff = INITIAL_BACKOFF * (2 ** attempt)
                    detail = base_resp.get("status_msg", "")
                    logger.warning(
                        f"[RAG] MiniMax API status={status_code} ({detail}), "
                        f"backing off {backoff}s (attempt {attempt+1}/{MAX_RETRIES})"
                    )
                    time.sleep(backoff)
                    continue
                if status_code != 0:
                    raise RuntimeError(
                        f"MiniMax API error {status_code}: {base_resp.get('status_msg', '')}"
                    )

                vectors = data.get("vectors", [])
                if not vectors:
                    raise ValueError(f"MiniMax returned no vectors: {data}")
                return [v["embedding"] for v in vectors]

            except (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout,
                    httpx.RemoteProtocolError, httpx.PoolTimeout,
                    httpx.ConnectTimeout) as exc:
                backoff = INITIAL_BACKOFF * (2 ** attempt)
                logger.warning(
                    f"[RAG] MiniMax connection error ({type(exc).__name__}), "
                    f"backing off {backoff}s (attempt {attempt+1}/{MAX_RETRIES})"
                )
                time.sleep(backoff)
                last_exc = exc
                continue

        raise RuntimeError(
            f"MiniMax embedding failed after {MAX_RETRIES} retries: "
            f"{type(last_exc).__name__ if last_exc else 'HTTP error'}"
        )

    def embed_query(self, text: str) -> list[float]:
        """Embed a single query string (type=query for semantic search)."""
        return self._post([text[:8192]], "query")[0]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of documents (type=db for indexing). MiniMax batch limit = 16."""
        results = []
        for i in range(0, len(texts), 16):
            batch = [t[:8192] for t in texts[i:i + 16]]
            results.extend(self._post(batch, "db"))
        return results

# ── Singleton ─────────────────────────────────────────────────────────────────
def _get_api_key() -> str:
    key = os.getenv("MINIMAX_API_KEY") or os.getenv("MINIMAX_API_TOKEN")
    if not key:
        raise ValueError("MINIMAX_API_KEY environment variable is not set")
    return key


_instance: Optional[MiniMaxEmbeddings] = None

def get_embeddings() -> MiniMaxEmbeddings:
    """Cached singleton — reuses HTTP session across calls."""
    global _instance
    if _instance is None:
        _instance = MiniMaxEmbeddings(api_key=_get_api_key())
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
      5. Generate embeddings via MiniMax e5-embedding-02
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
    logger.info(f"[RAG] Indexed article {article_id}: {stored} chunks stored")
    return {"article_id": article_id, "chunks_stored": stored, "errors": errors}


def index_rag_document(db: Session, rag_document_id: str) -> dict:
    """
    Index a standalone AIRagDocument PDF: extract text → chunk → embed → store.

    Pipeline:
      1. Load AIRagDocument
      2. Delete existing ai_rag_chunks for this document (re-index = full replace)
      3. Extract & chunk PDF text
      4. Generate embeddings via MiniMax e5-embedding-02
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
      1. Embed query via MiniMax (type=query)
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
