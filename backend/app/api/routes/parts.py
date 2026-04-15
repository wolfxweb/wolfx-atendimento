from typing import Optional, List
from uuid import UUID
import logging
import traceback
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.models import Part, User
from app.schemas.schemas import PartCreate, PartUpdate, PartResponse
from app.core.security import get_current_user

router = APIRouter(prefix="/parts", tags=["parts"])
logger = logging.getLogger(__name__)


@router.get("", response_model=List[PartResponse])
async def list_parts(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    search: Optional[str] = None,
    is_kit: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Part).options(joinedload(Part.children))

    if is_kit is not None:
        query = query.filter(Part.is_kit == is_kit)

    if search:
        query = query.filter(
            (Part.name.ilike(f"%{search}%")) |
            (Part.sku.ilike(f"%{search}%"))
        )

    parts = query.order_by(Part.id.desc()).offset(skip).limit(limit).all()
    return parts


@router.post("", response_model=PartResponse)
async def create_part(
    part_data: PartCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logger.info(f"[CREATE_PART] Received data: {part_data.model_dump()}")
    logger.info(f"[CREATE_PART] Current user: {current_user.id}, customer: {current_user.customer_id}")

    try:
        # Check unique SKU
        existing = db.query(Part).filter(Part.sku == part_data.sku).first()
        if existing:
            logger.warning(f"[CREATE_PART] SKU already exists: {part_data.sku}")
            raise HTTPException(status_code=400, detail="SKU já existe")

        # Normalize empty strings to None (prevents DB errors for UUID/Integer columns)
        part_dict = part_data.model_dump(exclude_none=True)
        for key, value in part_dict.items():
            if value == "" or value == b"":
                part_dict[key] = None
        logger.info(f"[CREATE_PART] Part dict for model: {part_dict}")

        part = Part(customer_id=current_user.customer_id, **part_dict)
        logger.info(f"[CREATE_PART] Part object created: {part}")
        db.add(part)
        db.commit()
        logger.info(f"[CREATE_PART] Committed, id: {part.id}")

        db.refresh(part)
        logger.info(f"[CREATE_PART] Refreshed, returning: id={part.id}, name={part.name}")

        return part

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[CREATE_PART] ERROR: {type(e).__name__}: {e}")
        logger.error(f"[CREATE_PART] Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Erro interno: {type(e).__name__}: {str(e)}")


@router.get("/{part_id}", response_model=PartResponse)
async def get_part(
    part_id: UUID,
    db: Session = Depends(get_db),
):
    part = db.query(Part).options(joinedload(Part.children)).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Peça não encontrada")
    return part


@router.patch("/{part_id}", response_model=PartResponse)
async def update_part(
    part_id: UUID,
    part_data: PartUpdate,
    db: Session = Depends(get_db),
):
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Peça não encontrada")

    update_data = part_data.model_dump(exclude_unset=True, exclude_none=True)
    for key, value in update_data.items():
        if value == "" or value == b"":
            value = None
        setattr(part, key, value)

    db.commit()
    db.refresh(part)
    return part


@router.delete("/{part_id}")
async def delete_part(
    part_id: UUID,
    db: Session = Depends(get_db),
):
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Peça não encontrada")

    # Check for children
    if part.children:
        raise HTTPException(status_code=400, detail="Eliminar primeiro as peças filho deste kit")

    db.delete(part)
    db.commit()
    return {"ok": True}
