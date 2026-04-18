"""
AI KB RAG Routes — /api/v1/ai/kb-rag/*
Wraps the RAG endpoints from routes/kb.py under the /ai/kb-rag path
expected by the frontend KBRAG component.
"""

import os
import uuid as uuid_lib
import threading
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.security import get_current_user, require_admin
from app.models.models import KBArticle, User, KBAttachment, AIRagDocument, AIRagChunk
from app.services.embedding_service import (
    index_article,
    delete_article_embeddings,
    search_similar_chunks,
    get_embeddings,
    index_rag_document,
)

# ─── Upload config (same as kb.py) ───────────────────────────────────────────
_UPLOAD_DIR = os.environ.get("KB_UPLOAD_DIR", "/app/uploads")
_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
os.makedirs(_UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/ai/kb-rag", tags=["AI KB RAG"])


def _async_index(db_url: str, article_id: str):
    """Background index worker for KB articles — creates its own DB session."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    engine = create_engine(db_url, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        index_article(session, article_id)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"[RAG] Background index failed for {article_id}: {e}")
    finally:
        session.close()
        engine.dispose()


def _async_index_rag_doc(db_url: str, rag_doc_id: str):
    """Background index worker for AIRagDocuments — creates its own DB session."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    engine = create_engine(db_url, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        index_rag_document(session, rag_doc_id)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"[RAG] Document index failed for {rag_doc_id}: {e}")
    finally:
        session.close()
        engine.dispose()


# ── Upload PDF for RAG (standalone — no article required) ─────────────────────
@router.post("/upload-pdf", status_code=201)
async def upload_pdf_for_rag(
    title: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Upload a PDF file as a standalone RAG document (no KB article required).

    POST /api/v1/ai/kb-rag/upload-pdf
    Form-data: title (str), file (PDF)
    """
    # Validate PDF
    content_type = file.content_type or "application/octet-stream"
    if content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Apenas ficheiros PDF são permitidos")

    # Read and validate size
    contents = await file.read()
    if len(contents) > _MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Arquivo muito grande. Máximo: {_MAX_FILE_SIZE // 1024 // 1024}MB",
        )

    # Save file
    unique_name = f"{uuid_lib.uuid4().hex}.pdf"
    file_path = os.path.join(_UPLOAD_DIR, unique_name)
    with open(file_path, "wb") as f:
        f.write(contents)

    # Create AIRagDocument
    rag_doc = AIRagDocument(
        title=title,
        file_path=file_path,
        original_filename=file.filename or unique_name,
        mime_type=content_type,
        file_size=len(contents),
        status="pending",
    )
    db.add(rag_doc)
    db.commit()
    db.refresh(rag_doc)

    # Trigger RAG indexing in background
    db_url = str(db.get_bind().url)
    thread = threading.Thread(target=_async_index_rag_doc, args=(db_url, str(rag_doc.id)))
    thread.start()

    return {
        "message": "PDF carregado e indexação iniciada",
        "rag_document_id": str(rag_doc.id),
        "title": rag_doc.title,
        "filename": rag_doc.original_filename,
        "file_size": len(contents),
    }


# ── List RAG Documents ────────────────────────────────────────────────────────
@router.get("/documents", status_code=200)
async def list_rag_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    List all standalone RAG documents.
    GET /api/v1/ai/kb-rag/documents
    """
    docs = db.query(AIRagDocument).order_by(AIRagDocument.created_at.desc()).all()
    return [
        {
            "id": str(doc.id),
            "title": doc.title,
            "filename": doc.original_filename,
            "file_size": doc.file_size,
            "status": doc.status,
            "chunk_count": doc.chunk_count,
            "error_message": doc.error_message,
            "embedded_at": doc.embedded_at.isoformat() if doc.embedded_at else None,
            "created_at": doc.created_at.isoformat() if doc.created_at else None,
        }
        for doc in docs
    ]


# ── Delete RAG Document ───────────────────────────────────────────────────────
@router.delete("/documents/{rag_document_id}", status_code=200)
async def delete_rag_document(
    rag_document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Delete a standalone RAG document and its chunks.
    DELETE /api/v1/ai/kb-rag/documents/{rag_document_id}
    """
    doc = db.query(AIRagDocument).filter(AIRagDocument.id == rag_document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")

    # Delete file if exists
    if doc.file_path and os.path.exists(doc.file_path):
        try:
            os.remove(doc.file_path)
        except OSError:
            pass

    # Delete chunks (cascade should handle this, but be explicit)
    db.query(AIRagChunk).filter(AIRagChunk.rag_document_id == rag_document_id).delete()
    db.delete(doc)
    db.commit()

    return {"message": "Documento eliminado", "rag_document_id": rag_document_id}


# ── Reindex RAG Document ─────────────────────────────────────────────────────
@router.post("/documents/{rag_document_id}/reindex", status_code=202)
async def reindex_rag_document(
    rag_document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Re-index a standalone RAG document.
    POST /api/v1/ai/kb-rag/documents/{rag_document_id}/reindex
    """
    doc = db.query(AIRagDocument).filter(AIRagDocument.id == rag_document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")

    db_url = str(db.get_bind().url)
    thread = threading.Thread(target=_async_index_rag_doc, args=(db_url, str(rag_document_id)))
    thread.start()

    return {"message": "Indexação iniciada", "rag_document_id": rag_document_id}


# ── Upload PDF for KB Article (existing endpoint — keeps article association) ──
@router.post("/upload-pdf-article/{article_id}", status_code=201)
async def upload_pdf_for_article(
    article_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Upload a PDF file and attach it to a KB article for RAG indexing.
    (Legacy — for articles that need PDF attachments)

    POST /api/v1/ai/kb-rag/upload-pdf-article/{article_id}
    """
    # Validate article exists
    article = db.query(KBArticle).filter(KBArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Artigo não encontrado")

    # Validate PDF
    content_type = file.content_type or "application/octet-stream"
    if content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Apenas ficheiros PDF são permitidos")

    # Read and validate size
    contents = await file.read()
    if len(contents) > _MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Arquivo muito grande. Máximo: {_MAX_FILE_SIZE // 1024 // 1024}MB",
        )

    # Save file
    unique_name = f"{uuid_lib.uuid4().hex}.pdf"
    file_path = os.path.join(_UPLOAD_DIR, unique_name)
    with open(file_path, "wb") as f:
        f.write(contents)

    # Create KBAttachment
    attachment = KBAttachment(
        article_id=article_id,
        filename=unique_name,
        original_name=file.filename or unique_name,
        file_path=file_path,
        mime_type=content_type,
        file_size=len(contents),
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    # Trigger RAG indexing in background (sync for small files, async for large)
    db_url = str(db.get_bind().url)
    thread = threading.Thread(target=_async_index, args=(db_url, str(article_id)))
    thread.start()

    return {
        "message": "PDF carregado e indexação iniciada",
        "attachment_id": str(attachment.id),
        "article_id": str(article_id),
        "filename": attachment.original_name,
        "file_size": len(contents),
    }


# ── Index All KB Articles ────────────────────────────────────────────────────
@router.post("/index-all", status_code=202)
async def index_all(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Re-index all KB articles in background.
    POST /api/v1/ai/kb-rag/index-all
    """
    articles = db.query(KBArticle).all()
    if not articles:
        return {"message": "No articles to index", "count": 0}

    db_url = str(db.get_bind().url)
    count = 0
    for article in articles:
        thread = threading.Thread(target=_async_index, args=(db_url, str(article.id)))
        thread.start()
        count += 1
    return {"message": f"Indexação iniciada para {count} artigos", "count": count}


# ── Reindex Single KB Article ───────────────────────────────────────────────
@router.post("/reindex/{article_id}", status_code=202)
async def reindex_single(
    article_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Trigger re-indexing of a single KB article.
    POST /api/v1/ai/kb-rag/reindex/{article_id}
    """
    article = db.query(KBArticle).filter(KBArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Artigo não encontrado")

    db_url = str(db.get_bind().url)
    thread = threading.Thread(target=_async_index, args=(db_url, str(article_id)))
    thread.start()

    return {"message": f"Indexação iniciada para artigo {article_id}", "article_id": str(article_id)}


# ── Delete Article Index ────────────────────────────────────────────────────
@router.delete("/{article_id}", status_code=200)
async def delete_index(
    article_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Delete all RAG embeddings for a KB article.
    DELETE /api/v1/ai/kb-rag/{article_id}
    """
    article = db.query(KBArticle).filter(KBArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Artigo não encontrado")
    count = delete_article_embeddings(db, article_id)
    return {"message": f"{count} chunks removidos do índice", "deleted": count}


# ── Semantic Search ──────────────────────────────────────────────────────────
@router.post("/search", status_code=200)
async def search(
    query: str = Body(..., embed=True),
    article_ids: Optional[List[str]] = Body(None, embed=True),
    rag_document_ids: Optional[List[str]] = Body(None, embed=True),
    top_k: int = Body(5, embed=True),
    min_similarity: float = Body(0.3, embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Semantic RAG search across KB embeddings and standalone RAG documents.
    POST /api/v1/ai/kb-rag/search
    """
    try:
        get_embeddings()
    except ValueError as e:
        raise HTTPException(status_code=503, detail=f"Embedding service unavailable: {e}")

    results = search_similar_chunks(
        db=db,
        query=query,
        article_ids=article_ids,
        rag_document_ids=rag_document_ids,
        top_k=top_k,
        min_similarity=min_similarity,
    )
    return {"query": query, "results": results, "count": len(results)}


# ── Embedding Count ──────────────────────────────────────────────────────────
@router.get("/count/{article_id}", status_code=200)
async def embedding_count(
    article_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the number of stored embedding chunks for an article."""
    from app.models.models import AIEmbedding
    count = db.query(AIEmbedding).filter(AIEmbedding.article_id == article_id).count()
    return {"article_id": str(article_id), "chunks": count}
