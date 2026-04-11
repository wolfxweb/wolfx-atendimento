from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Category, User
from app.schemas.schemas import CategoryCreate, CategoryUpdate, CategoryResponse
from app.core.security import require_admin, get_current_user

router = APIRouter()


@router.get("/categories", response_model=List[CategoryResponse])
async def list_categories(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    categories = db.query(Category).filter(Category.is_active == True).offset(skip).limit(limit).all()
    return categories


@router.get("/categories/product", response_model=List[CategoryResponse])
async def list_product_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    categories = db.query(Category).filter(
        Category.type == "product",
        Category.is_active == True
    ).order_by(Category.order).all()
    return categories


@router.get("/categories/ticket", response_model=List[CategoryResponse])
async def list_ticket_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    categories = db.query(Category).filter(
        Category.type == "ticket",
        Category.is_active == True
    ).order_by(Category.order).all()
    return categories


@router.post("/categories", response_model=CategoryResponse)
async def create_category(
    category_data: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin())
):
    # Verificar se slug já existe
    existing = db.query(Category).filter(Category.slug == category_data.slug).first()
    if existing:
        raise HTTPException(status_code=400, detail="Slug already exists")
    
    category = Category(**category_data.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/categories/{category_id}", response_model=CategoryResponse)
async def get_category(
    category_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.patch("/categories/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: UUID,
    category_data: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin())
):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    for key, value in category_data.model_dump(exclude_unset=True).items():
        setattr(category, key, value)
    
    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin())
):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    category.is_active = False
    db.commit()
    return {"message": "Category deactivated"}
