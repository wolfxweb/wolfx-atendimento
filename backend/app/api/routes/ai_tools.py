"""
AI Tools CRUD API
GET  /api/v1/ai/tools            — listar (filtros: tool_type, is_active, customer_id)
POST /api/v1/ai/tools            — criar
GET  /api/v1/ai/tools/{id}      — ver um
PATCH /api/v1/ai/tools/{id}      — actualizar
DELETE /api/v1/ai/tools/{id}    — apagar (não system)
PATCH /api/v1/ai/tools/{id}/activate — toggle is_active
PATCH /api/v1/ai/tools/{id}/default  — definir como default
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import Optional
from uuid import UUID

from app.database import get_db
from app.models.ai_models import AITool
from app.schemas.ai_schemas import (
    AIToolCreate,
    AIToolUpdate,
    AIToolResponse,
)

router = APIRouter(prefix="/ai/tools", tags=["AI Tools"])


def _clear_defaults(db: Session, tool_type: str, customer_id: Optional[UUID]):
    """Remove is_default das outras tools do mesmo tipo/cliente."""
    others = db.query(AITool).filter(
        AITool.tool_type == tool_type,
        AITool.customer_id == customer_id,
        AITool.is_default == True,
    )
    for t in others:
        t.is_default = False


@router.get("", response_model=list[AIToolResponse])
def list_tools(
    tool_type: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    customer_id: Optional[UUID] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(AITool)
    if tool_type:
        q = q.filter(AITool.tool_type == tool_type)
    if is_active is not None:
        q = q.filter(AITool.is_active == is_active)
    if customer_id is not None:
        q = q.filter(AITool.customer_id == customer_id)
    else:
        q = q.filter(AITool.customer_id.is_(None))
    return q.order_by(AITool.tool_type, AITool.name).all()


@router.post("", response_model=AIToolResponse, status_code=201)
def create_tool(data: AIToolCreate, db: Session = Depends(get_db)):
    if data.is_default:
        _clear_defaults(db, data.tool_type, data.customer_id)

    try:
        tool = AITool(**data.model_dump())
        db.add(tool)
        db.commit()
        db.refresh(tool)
        return tool
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Já existe uma tool com o nome '{data.name}' para este cliente"
        )


@router.get("/{tool_id}", response_model=AIToolResponse)
def get_tool(tool_id: UUID, db: Session = Depends(get_db)):
    tool = db.query(AITool).filter(AITool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool não encontrada")
    return tool


@router.patch("/{tool_id}", response_model=AIToolResponse)
def update_tool(tool_id: UUID, data: AIToolUpdate, db: Session = Depends(get_db)):
    tool = db.query(AITool).filter(AITool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool não encontrada")

    if data.is_default:
        _clear_defaults(db, tool.tool_type, tool.customer_id)

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(tool, key, value)

    try:
        db.commit()
        db.refresh(tool)
        return tool
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Conflito de nome para esta tool")


@router.delete("/{tool_id}", status_code=204)
def delete_tool(tool_id: UUID, db: Session = Depends(get_db)):
    tool = db.query(AITool).filter(AITool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool não encontrada")
    if tool.is_system:
        raise HTTPException(status_code=400, detail="Tools de sistema não podem ser apagadas")
    db.delete(tool)
    db.commit()


@router.patch("/{tool_id}/activate", response_model=AIToolResponse)
def toggle_tool_active(tool_id: UUID, db: Session = Depends(get_db)):
    tool = db.query(AITool).filter(AITool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool não encontrada")
    tool.is_active = not tool.is_active
    db.commit()
    db.refresh(tool)
    return tool


@router.patch("/{tool_id}/default", response_model=AIToolResponse)
def set_tool_default(tool_id: UUID, db: Session = Depends(get_db)):
    tool = db.query(AITool).filter(AITool.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool não encontrada")
    if not tool.is_active:
        raise HTTPException(status_code=400, detail="Não pode definir uma tool inactiva como default")

    _clear_defaults(db, tool.tool_type, tool.customer_id)
    tool.is_default = True
    db.commit()
    db.refresh(tool)
    return tool
