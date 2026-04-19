"""
AI Models API Routes
CRUD for LLM and Embedding model configurations.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from app.database import get_db
from app.models.ai_models import AIModel
from app.schemas.ai_schemas import (
    AIModelCreate, AIModelUpdate, AIModelResponse
)
from app.api.routes.auth import get_current_user
from app.models.models import User

router = APIRouter(prefix="/ai/models", tags=["AI Models"])


def _clear_defaults_for_type(db: Session, model_type: str, except_id: UUID):
    """Remove is_default=True from all other models of the same type."""
    db.query(AIModel).filter(
        AIModel.type == model_type,
        AIModel.id != except_id
    ).update({"is_default": False})


@router.get("", response_model=list[AIModelResponse])
def list_models(
    type: Optional[str] = Query(None),  # 'llm' | 'embedding'
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista todos os modelos configurados."""
    q = db.query(AIModel)
    if type:
        q = q.filter(AIModel.type == type)
    if is_active is not None:
        q = q.filter(AIModel.is_active == is_active)
    return q.order_by(AIModel.type, AIModel.name).all()


@router.get("/active", response_model=dict)
def get_active_models(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retorna o modelo ativo de cada tipo (llm e embedding)."""
    llm = db.query(AIModel).filter(
        AIModel.type == "llm",
        AIModel.is_active == True
    ).first()
    embedding = db.query(AIModel).filter(
        AIModel.type == "embedding",
        AIModel.is_active == True
    ).first()
    return {
        "llm": AIModelResponse.model_validate(llm) if llm else None,
        "embedding": AIModelResponse.model_validate(embedding) if embedding else None,
    }


@router.post("", response_model=AIModelResponse, status_code=201)
def create_model(
    data: AIModelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cria um novo modelo. Se is_default=True, limpa defaults anteriores do mesmo tipo."""
    if data.is_default:
        db.query(AIModel).filter(
            AIModel.type == data.type,
            AIModel.is_default == True
        ).update({"is_default": False})

    model = AIModel(
        name=data.name,
        type=data.type,
        provider=data.provider,
        model_id=data.model_id,
        api_base=data.api_base,
        api_key_ref=data.api_key_ref,
        temperature=data.temperature,
        max_tokens=data.max_tokens,
        top_p=data.top_p,
        top_k=data.top_k,
        dimension=data.dimension,
        is_active=data.is_default,  # se é default, também é active
        is_default=data.is_default,
        is_system=False,
        description=data.description,
    )
    db.add(model)
    db.commit()
    db.refresh(model)
    return model


@router.patch("/{model_id}", response_model=AIModelResponse)
def update_model(
    model_id: UUID,
    data: AIModelUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza configuração de um modelo. Operações de activate/default limpam os outros."""
    model = db.query(AIModel).filter(AIModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    if model.is_system:
        raise HTTPException(status_code=403, detail="Cannot modify system model")

    # Se está a ativar ou marcar como default, limpa os outros do mesmo tipo
    if data.is_active == True or data.is_default == True:
        _clear_defaults_for_type(db, model.type, model.id)

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(model, field, value)

    db.commit()
    db.refresh(model)
    return model


@router.delete("/{model_id}")
def delete_model(
    model_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Apaga um modelo. Modelos system=True não podem ser apagados."""
    model = db.query(AIModel).filter(AIModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    if model.is_system:
        raise HTTPException(status_code=403, detail="Cannot delete system model")

    db.delete(model)
    db.commit()
    return {"message": "Model deleted"}


@router.post("/{model_id}/activate", response_model=AIModelResponse)
def activate_model(
    model_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Ativa um modelo (is_active=True) — desativa os outros do mesmo tipo."""
    model = db.query(AIModel).filter(AIModel.id == model_id).first()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    _clear_defaults_for_type(db, model.type, model.id)
    model.is_active = True
    model.is_default = True
    db.commit()
    db.refresh(model)
    return model
