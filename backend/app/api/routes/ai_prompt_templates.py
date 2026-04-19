"""
AI Prompt Templates CRUD API
GET  /api/v1/ai/prompt-templates      — listar (filtros: type, is_active, customer_id)
POST /api/v1/ai/prompt-templates      — criar
GET  /api/v1/ai/prompt-templates/{id} — ver um
PATCH /api/v1/ai/prompt-templates/{id} — actualizar
DELETE /api/v1/ai/prompt-templates/{id} — apagar (não system)
PATCH /api/v1/ai/prompt-templates/{id}/activate — toggle is_active
PATCH /api/v1/ai/prompt-templates/{id}/default  — definir como default
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID

from app.database import get_db
from app.models.ai_models import AIPromptTemplate
from app.schemas.ai_schemas import (
    AIPromptTemplateCreate,
    AIPromptTemplateUpdate,
    AIPromptTemplateResponse,
)

router = APIRouter(prefix="/ai/prompt-templates", tags=["AI Prompt Templates"])


def _clear_defaults(db: Session, template_type: str, customer_id: Optional[UUID]):
    """Remove is_default dos outros templates do mesmo tipo/cliente."""
    others = db.query(AIPromptTemplate).filter(
        AIPromptTemplate.type == template_type,
        AIPromptTemplate.customer_id == customer_id,
        AIPromptTemplate.is_default == True,
    )
    for t in others:
        t.is_default = False


@router.get("", response_model=list[AIPromptTemplateResponse])
def list_prompt_templates(
    type: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    customer_id: Optional[UUID] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(AIPromptTemplate)
    if type:
        q = q.filter(AIPromptTemplate.type == type)
    if is_active is not None:
        q = q.filter(AIPromptTemplate.is_active == is_active)
    if customer_id is not None:
        q = q.filter(AIPromptTemplate.customer_id == customer_id)
    else:
        q = q.filter(AIPromptTemplate.customer_id.is_(None))
    return q.order_by(AIPromptTemplate.type, AIPromptTemplate.name).all()


@router.post("", response_model=AIPromptTemplateResponse, status_code=201)
def create_prompt_template(data: AIPromptTemplateCreate, db: Session = Depends(get_db)):
    if data.is_default:
        _clear_defaults(db, data.type, data.customer_id)

    template = AIPromptTemplate(**data.model_dump())
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.get("/{template_id}", response_model=AIPromptTemplateResponse)
def get_prompt_template(template_id: UUID, db: Session = Depends(get_db)):
    template = db.query(AIPromptTemplate).filter(AIPromptTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado")
    return template


@router.patch("/{template_id}", response_model=AIPromptTemplateResponse)
def update_prompt_template(
    template_id: UUID,
    data: AIPromptTemplateUpdate,
    db: Session = Depends(get_db),
):
    template = db.query(AIPromptTemplate).filter(AIPromptTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado")

    if data.is_default:
        _clear_defaults(db, template.type, template.customer_id)

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(template, key, value)

    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=204)
def delete_prompt_template(template_id: UUID, db: Session = Depends(get_db)):
    template = db.query(AIPromptTemplate).filter(AIPromptTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado")
    if template.is_system:
        raise HTTPException(status_code=400, detail="Templates de sistema não podem ser apagados")
    db.delete(template)
    db.commit()


@router.patch("/{template_id}/activate", response_model=AIPromptTemplateResponse)
def toggle_prompt_template_active(template_id: UUID, db: Session = Depends(get_db)):
    template = db.query(AIPromptTemplate).filter(AIPromptTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado")
    template.is_active = not template.is_active
    db.commit()
    db.refresh(template)
    return template


@router.patch("/{template_id}/default", response_model=AIPromptTemplateResponse)
def set_prompt_template_default(template_id: UUID, db: Session = Depends(get_db)):
    template = db.query(AIPromptTemplate).filter(AIPromptTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado")
    if not template.is_active:
        raise HTTPException(status_code=400, detail="Não pode definir um template inactivo como default")

    _clear_defaults(db, template.type, template.customer_id)
    template.is_default = True
    db.commit()
    db.refresh(template)
    return template
