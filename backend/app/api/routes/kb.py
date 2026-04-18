import os
import uuid as uuid_lib
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Body
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, func

from app.database import get_db
from app.models.models import KBArticle, KBArticleCategory, KBAttachment, KBTag, User
from app.schemas.schemas import (
    KBCategoryCreate, KBCategoryUpdate, KBCategoryResponse,
    KBTagCreate, KBTagResponse,
    KBAttachmentResponse,
    KBArticleCreate, KBArticleUpdate, KBArticleListItem, KBArticleDetail,
)
from app.core.security import require_admin, require_agent, get_current_user

router = APIRouter()

# ─── Configuração de uploads ───
UPLOAD_DIR = os.environ.get("KB_UPLOAD_DIR", "/tmp/kb_uploads")
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "text/plain": ".txt",
    "application/zip": ".zip",
}
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ─── Utilitários ───
def _article_to_list_item(article: KBArticle) -> dict:
    return {
        "id": article.id,
        "title": article.title,
        "summary": article.summary,
        "status": article.status,
        "views": article.views,
        "category_id": article.category_id,
        "author_id": article.author_id,
        "author_name": article.author.name if article.author else None,
        "category_name": article.category.name if article.category else None,
        "tags": [{"id": str(t.id), "name": t.name, "created_at": t.created_at} for t in article.tags],
        "attachment_count": len(article.attachments),
        "created_at": article.created_at,
        "updated_at": article.updated_at,
    }


def _sync_tags(db: Session, article: KBArticle, tag_names: List[str]):
    article.tags.clear()
    for name in tag_names:
        name = name.strip().lower()
        if not name:
            continue
        tag = db.query(KBTag).filter(KBTag.name == name).first()
        if not tag:
            tag = KBTag(name=name)
            db.add(tag)
        article.tags.append(tag)


# ═══════════════════════════════════════════
# CATEGORIAS
# ═══════════════════════════════════════════

@router.get("/kb/categories", response_model=List[KBCategoryResponse])
async def list_categories(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista categorias (hierárquicas). Admin vê todas; customers só activas."""
    q = db.query(KBArticleCategory)
    if not include_inactive:
        q = q.filter(KBArticleCategory.is_active == True)
    cats = q.order_by(KBArticleCategory.name).all()
    # Build tree
    cat_map = {c.id: c for c in cats}
    roots = []
    for c in cats:
        if c.parent_id is None:
            roots.append(c)
    return _build_tree(roots, cats)


def _build_tree(roots: List, all_cats: List) -> List[dict]:
    cat_map = {c.id: c for c in all_cats}
    def to_dict(c):
        children = [cat_map[cid] for cid in cat_map if cat_map[cid].parent_id == c.id]
        return {
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "parent_id": c.parent_id,
            "is_active": c.is_active,
            "created_at": c.created_at,
            "updated_at": c.updated_at,
            "children": [_build_child_dict(ch, cat_map) for ch in children],
        }
    def _build_child_dict(c, cat_map):
        children = [cat_map[cid] for cid in cat_map if cat_map[cid].parent_id == c.id]
        return {
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "parent_id": c.parent_id,
            "is_active": c.is_active,
            "created_at": c.created_at,
            "updated_at": c.updated_at,
            "children": [_build_child_dict(ch, cat_map) for ch in children],
        }
    return [to_dict(r) for r in roots]


@router.post("/kb/categories", response_model=KBCategoryResponse, status_code=201)
async def create_category(
    data: KBCategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if data.parent_id:
        parent = db.query(KBArticleCategory).filter(KBArticleCategory.id == data.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Categoria pai não encontrada")
    cat = KBArticleCategory(**data.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {
        "id": cat.id, "name": cat.name, "description": cat.description,
        "parent_id": cat.parent_id, "is_active": cat.is_active,
        "created_at": cat.created_at, "updated_at": cat.updated_at, "children": [],
    }


@router.patch("/kb/categories/{cat_id}", response_model=KBCategoryResponse)
async def update_category(
    cat_id,
    data: KBCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    cat = db.query(KBArticleCategory).filter(KBArticleCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(cat, key, value)
    db.commit()
    db.refresh(cat)
    return {
        "id": cat.id, "name": cat.name, "description": cat.description,
        "parent_id": cat.parent_id, "is_active": cat.is_active,
        "created_at": cat.created_at, "updated_at": cat.updated_at, "children": [],
    }


@router.delete("/kb/categories/{cat_id}")
async def delete_category(
    cat_id,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    cat = db.query(KBArticleCategory).filter(KBArticleCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    # Check for child categories
    has_children = db.query(KBArticleCategory).filter(KBArticleCategory.parent_id == cat_id).first()
    if has_children:
        raise HTTPException(status_code=400, detail="Remove primeiro as subcategorias")
    db.delete(cat)
    db.commit()
    return {"message": "Categoria eliminada"}


# ═══════════════════════════════════════════
# TAGS
# ═══════════════════════════════════════════

@router.get("/kb/tags", response_model=List[KBTagResponse])
async def list_tags(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tags = db.query(KBTag).order_by(KBTag.name).all()
    return tags


@router.post("/kb/tags", response_model=KBTagResponse, status_code=201)
async def create_tag(
    data: KBTagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    existing = db.query(KBTag).filter(KBTag.name == data.name.strip().lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="Tag já existe")
    tag = KBTag(name=data.name.strip().lower())
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/kb/tags/{tag_id}")
async def delete_tag(
    tag_id,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    tag = db.query(KBTag).filter(KBTag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag não encontrada")
    db.delete(tag)
    db.commit()
    return {"message": "Tag eliminada"}


# ═══════════════════════════════════════════
# ARTIGOS
# ═══════════════════════════════════════════

@router.get("/kb/articles", response_model=List[KBArticleListItem])
async def list_articles(
    status: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista artigos. Customers só vêem published; admins veem todos."""
    q = db.query(KBArticle).options(
        joinedload(KBArticle.category),
        joinedload(KBArticle.author),
        joinedload(KBArticle.tags),
        joinedload(KBArticle.attachments),
    )
    if current_user.role == "customer":
        q = q.filter(KBArticle.status == "published")
    elif status:
        q = q.filter(KBArticle.status == status)

    if category_id:
        q = q.filter(KBArticle.category_id == category_id)
    if tag:
        q = q.join(KBArticle.tags).filter(KBTag.name == tag)

    articles = q.order_by(KBArticle.updated_at.desc()).all()
    return [_article_to_list_item(a) for a in articles]


@router.get("/kb/articles/{article_id}", response_model=KBArticleDetail)
async def get_article(
    article_id,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    article = db.query(KBArticle).options(
        joinedload(KBArticle.category),
        joinedload(KBArticle.author),
        joinedload(KBArticle.tags),
        joinedload(KBArticle.attachments),
    ).filter(KBArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Artigo não encontrado")

    if current_user.role == "customer" and article.status != "published":
        raise HTTPException(status_code=403, detail="Accesso negado")

    # Increment views
    article.views = (article.views or 0) + 1
    db.commit()

    return {
        "id": article.id,
        "title": article.title,
        "content": article.content,
        "summary": article.summary,
        "status": article.status,
        "views": article.views,
        "category_id": article.category_id,
        "author_id": article.author_id,
        "author_name": article.author.name if article.author else None,
        "category_name": article.category.name if article.category else None,
        "tags": [{"id": str(t.id), "name": t.name, "created_at": t.created_at} for t in article.tags],
        "attachments": [{
            "id": a.id, "article_id": a.article_id, "filename": a.filename,
            "original_name": a.original_name, "mime_type": a.mime_type,
            "file_size": a.file_size, "created_at": a.created_at,
        } for a in article.attachments],
        "created_at": article.created_at,
        "updated_at": article.updated_at,
    }


@router.post("/kb/articles", response_model=KBArticleDetail, status_code=201)
async def create_article(
    data: KBArticleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    article_dict = data.model_dump(exclude={"tags"})
    article = KBArticle(**article_dict, author_id=current_user.id)
    db.add(article)
    db.flush()
    if data.tags:
        _sync_tags(db, article, data.tags)
    db.commit()
    db.refresh(article)
    # Re-fetch with relations
    article = db.query(KBArticle).options(
        joinedload(KBArticle.category),
        joinedload(KBArticle.author),
        joinedload(KBArticle.tags),
        joinedload(KBArticle.attachments),
    ).filter(KBArticle.id == article.id).first()
    result = _article_to_list_item(article)
    result["content"] = article.content
    result["attachments"] = [{
        "id": a.id, "article_id": a.article_id, "filename": a.filename,
        "original_name": a.original_name, "mime_type": a.mime_type,
        "file_size": a.file_size, "created_at": a.created_at,
    } for a in article.attachments]
    return result


@router.patch("/kb/articles/{article_id}", response_model=KBArticleDetail)
async def update_article(
    article_id,
    data: KBArticleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    article = db.query(KBArticle).filter(KBArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Artigo não encontrado")

    if current_user.role not in ("admin", "agent"):
        raise HTTPException(status_code=403, detail="Accesso negado")

    updates = data.model_dump(exclude_unset=True, exclude={"tags"})
    for key, value in updates.items():
        setattr(article, key, value)
    if data.tags is not None:
        _sync_tags(db, article, data.tags)
    db.commit()
    db.refresh(article)

    article = db.query(KBArticle).options(
        joinedload(KBArticle.category),
        joinedload(KBArticle.author),
        joinedload(KBArticle.tags),
        joinedload(KBArticle.attachments),
    ).filter(KBArticle.id == article.id).first()
    result = _article_to_list_item(article)
    result["content"] = article.content
    result["attachments"] = [{
        "id": a.id, "article_id": a.article_id, "filename": a.filename,
        "original_name": a.original_name, "mime_type": a.mime_type,
        "file_size": a.file_size, "created_at": a.created_at,
    } for a in article.attachments]
    return result


@router.delete("/kb/articles/{article_id}")
async def delete_article(
    article_id,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    article = db.query(KBArticle).filter(KBArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Artigo não encontrado")
    # Remove files from disk
    for att in article.attachments:
        try:
            if os.path.exists(att.file_path):
                os.remove(att.file_path)
        except Exception:
            pass
    db.delete(article)
    db.commit()
    return {"message": "Artigo eliminado"}


# ═══════════════════════════════════════════
# BUSCA
# ═══════════════════════════════════════════

@router.get("/kb/search", response_model=List[KBArticleListItem])
async def search_articles(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Busca por título, conteúdo e tags. Customers só vêem published."""
    term = f"%{q}%"
    article_ids_from_tags = []
    if current_user.role != "customer":
        tag_results = db.query(KBTag).filter(KBTag.name.ilike(f"%{q}%")).all()
        article_ids_from_tags = [t.id for t in tag_results]

    sq = db.query(KBArticle.id).filter(
        or_(
            KBArticle.title.ilike(term),
            KBArticle.content.ilike(term),
            KBArticle.summary.ilike(term),
        )
    )
    if current_user.role == "customer":
        sq = sq.filter(KBArticle.status == "published")

    articles = db.query(KBArticle).options(
        joinedload(KBArticle.category),
        joinedload(KBArticle.author),
        joinedload(KBArticle.tags),
        joinedload(KBArticle.attachments),
    ).filter(KBArticle.id.in_(sq)).order_by(KBArticle.updated_at.desc()).all()

    return [_article_to_list_item(a) for a in articles]


@router.get("/kb/articles/{article_id}/related", response_model=List[KBArticleListItem])
async def related_articles(
    article_id,
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Artigos relacionados (mesma categoria ou tags em comum)."""
    article = db.query(KBArticle).filter(KBArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Artigo não encontrado")

    tag_ids = [t.id for t in article.tags]
    cat_id = article.category_id

    q = db.query(KBArticle).options(
        joinedload(KBArticle.category),
        joinedload(KBArticle.author),
        joinedload(KBArticle.tags),
        joinedload(KBArticle.attachments),
    ).filter(KBArticle.id != article_id, KBArticle.status == "published")

    if tag_ids:
        q = q.join(KBArticle.tags).filter(KBTag.id.in_(tag_ids))
    elif cat_id:
        q = q.filter(KBArticle.category_id == cat_id)
    else:
        return []

    articles = q.distinct().limit(limit).all()
    return [_article_to_list_item(a) for a in articles]


@router.get("/kb/suggest", response_model=List[KBArticleListItem])
async def suggest_articles(
    text: str = Query(..., min_length=3),
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sugere artigos com base num texto (usado na criação de tickets)."""
    term = f"%{text}%"
    articles = db.query(KBArticle).options(
        joinedload(KBArticle.category),
        joinedload(KBArticle.author),
        joinedload(KBArticle.tags),
        joinedload(KBArticle.attachments),
    ).filter(
        KBArticle.status == "published",
        or_(
            KBArticle.title.ilike(term),
            KBArticle.content.ilike(term),
            KBArticle.summary.ilike(term),
        )
    ).limit(limit).all()
    return [_article_to_list_item(a) for a in articles]


# ═══════════════════════════════════════════
# AVALIAÇÃO
# ═══════════════════════════════════════════

@router.post("/kb/articles/{article_id}/vote")
async def vote_article(
    article_id,
    vote: str = Body(..., embed=True),  # "useful" or "not_useful"
    db: Session = Depends(get_db),
):
    if vote not in ("useful", "not_useful"):
        raise HTTPException(status_code=400, detail="Vote must be 'useful' or 'not_useful'")
    article = db.query(KBArticle).filter(KBArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Artigo não encontrado")
    if vote == "useful":
        article.useful_count = (article.useful_count or 0) + 1
    else:
        article.not_useful_count = (article.not_useful_count or 0) + 1
    db.commit()
    db.refresh(article)
    return {"useful_count": article.useful_count, "not_useful_count": article.not_useful_count}


# ═══════════════════════════════════════════
# ANEXOS
# ═══════════════════════════════════════════

@router.post("/kb/articles/{article_id}/attachments", response_model=KBAttachmentResponse, status_code=201)
async def upload_attachment(
    article_id,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    article = db.query(KBArticle).filter(KBArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Artigo não encontrado")

    # Validate file type
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Tipo de arquivo não permitido: {content_type}")

    # Read and validate size
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"Arquivo muito grande. Máximo: {MAX_FILE_SIZE // 1024 // 1024}MB")

    # Generate unique filename
    ext = ALLOWED_TYPES.get(content_type, ".bin")
    unique_name = f"{uuid_lib.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)

    with open(file_path, "wb") as f:
        f.write(contents)

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
    return attachment


@router.delete("/kb/attachments/{att_id}")
async def delete_attachment(
    att_id,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    att = db.query(KBAttachment).filter(KBAttachment.id == att_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Anexo não encontrado")
    try:
        if os.path.exists(att.file_path):
            os.remove(att.file_path)
    except Exception:
        pass
    db.delete(att)
    db.commit()
    return {"message": "Anexo eliminado"}


@router.get("/kb/attachments/{att_id}/download")
async def download_attachment(
    att_id,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    att = db.query(KBAttachment).filter(KBAttachment.id == att_id).first()
    if not att:
        raise HTTPException(status_code=404, detail="Anexo não encontrado")
    if not os.path.exists(att.file_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no servidor")
    return FileResponse(
        att.file_path,
        media_type=att.mime_type,
        filename=att.original_name,
    )


# ═══════════════════════════════════════════
# RAG — EMBEDDINGS & SEMANTIC SEARCH
# ═══════════════════════════════════════════
# Note: these are mounted under /api/v1/kb/* because they are KB-centric.
# The AI module plan references /ai/rag/* — we expose both for flexibility.

import threading
from app.services.embedding_service import (
    index_article,
    delete_article_embeddings,
    search_similar_chunks,
    get_embeddings,
)


def _async_index(db_url: str, article_id: str):
    """Background thread: index article without blocking the HTTP response."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        index_article(session, article_id)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"[RAG] Background index failed for {article_id}: {e}")
    finally:
        session.close()
        engine.dispose()


@router.post("/kb/articles/{article_id}/index", status_code=202)
async def index_article_endpoint(
    article_id,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Trigger re-indexing of a KB article for RAG.
    Runs in background — returns immediately.
    """
    article = db.query(KBArticle).filter(KBArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Artigo não encontrado")

    db_url = str(db.get_bind().url)
    thread = threading.Thread(target=_async_index, args=(db_url, str(article_id)))
    thread.start()

    return {"message": f"Indexação iniciada para artigo {article_id}", "article_id": str(article_id)}


@router.post("/kb/articles/index-all", status_code=202)
async def index_all_articles(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Re-index all KB articles in background.
    """
    articles = db.query(KBArticle).all()
    db_url = str(db.get_bind().url)
    count = 0
    for article in articles:
        thread = threading.Thread(target=_async_index, args=(db_url, str(article.id)))
        thread.start()
        count += 1
    return {"message": f"Indexação iniciada para {count} artigos", "count": count}


@router.delete("/kb/articles/{article_id}/index")
async def delete_article_index(
    article_id,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Delete all RAG embeddings for a KB article."""
    article = db.query(KBArticle).filter(KBArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Artigo não encontrado")
    count = delete_article_embeddings(db, article_id)
    return {"message": f"{count} chunks removidos do índice", "deleted": count}


@router.post("/kb/rag/search")
async def rag_search(
    query: str = Body(..., embed=True),
    article_ids: Optional[List[str]] = Body(None, embed=True),
    top_k: int = Body(5, embed=True),
    min_similarity: float = Body(0.3, embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Semantic RAG search across KB article embeddings.

    Body (JSON):
      query: string (required) — search query
      article_ids: list of UUID strings (optional) — filter to specific articles
      top_k: int (default 5) — number of results
      min_similarity: float (default 0.3) — minimum cosine similarity threshold
    """
    try:
        get_embeddings()  # validates API key is set
    except ValueError as e:
        raise HTTPException(status_code=503, detail=f"Embedding service unavailable: {e}")

    results = search_similar_chunks(
        db=db,
        query=query,
        article_ids=article_ids,
        top_k=top_k,
        min_similarity=min_similarity,
    )
    return {"query": query, "results": results, "count": len(results)}


@router.get("/kb/articles/{article_id}/embeddings/count")
async def get_article_embedding_count(
    article_id,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the number of stored embedding chunks for an article."""
    from app.models.models import AIEmbedding
    count = db.query(AIEmbedding).filter(AIEmbedding.article_id == article_id).count()
    return {"article_id": str(article_id), "chunks": count}
