from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.models import ProductPart, Product, Part, User
from app.schemas.schemas import ProductPartCreate, ProductPartUpdate, ProductPartResponse
from app.core.security import get_current_user

router = APIRouter()


@router.get("/product-parts", response_model=List[ProductPartResponse])
async def list_product_parts(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    product_id: Optional[UUID] = None,
    part_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(ProductPart).options(
        joinedload(ProductPart.part),
        joinedload(ProductPart.product)
    )

    if product_id:
        query = query.filter(ProductPart.product_id == product_id)

    if part_id:
        query = query.filter(ProductPart.part_id == part_id)

    # Verificar acesso por produto ou parte
    if current_user.role == "customer":
        query = query.join(Product).filter(Product.customer_id == current_user.customer_id)

    product_parts = query.offset(skip).limit(limit).all()
    return product_parts


@router.post("/product-parts", response_model=ProductPartResponse)
async def create_product_part(
    product_part_data: ProductPartCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verificar se o produto existe
    product = db.query(Product).filter(Product.id == product_part_data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Verificar acesso ao produto
    if current_user.role == "customer" and product.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Verificar se a parte existe
    part = db.query(Part).filter(Part.id == product_part_data.part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    # Verificar acesso à parte
    if current_user.role == "customer" and part.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Verificar se já existe a associação
    existing = db.query(ProductPart).filter(
        ProductPart.product_id == product_part_data.product_id,
        ProductPart.part_id == product_part_data.part_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="ProductPart association already exists")

    product_part = ProductPart(**product_part_data.model_dump())
    db.add(product_part)
    db.commit()
    db.refresh(product_part)
    return product_part


@router.get("/product-parts/{product_part_id}", response_model=ProductPartResponse)
async def get_product_part(
    product_part_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    product_part = db.query(ProductPart).options(
        joinedload(ProductPart.part),
        joinedload(ProductPart.product)
    ).filter(ProductPart.id == product_part_id).first()

    if not product_part:
        raise HTTPException(status_code=404, detail="ProductPart not found")

    # Verificar acesso
    if current_user.role == "customer" and product_part.product.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return product_part


@router.patch("/product-parts/{product_part_id}", response_model=ProductPartResponse)
async def update_product_part(
    product_part_id: UUID,
    product_part_data: ProductPartUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    product_part = db.query(ProductPart).options(
        joinedload(ProductPart.part),
        joinedload(ProductPart.product)
    ).filter(ProductPart.id == product_part_id).first()

    if not product_part:
        raise HTTPException(status_code=404, detail="ProductPart not found")

    # Verificar acesso
    if current_user.role == "customer" and product_part.product.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")

    for key, value in product_part_data.model_dump(exclude_unset=True).items():
        setattr(product_part, key, value)

    db.commit()
    db.refresh(product_part)
    return product_part


@router.delete("/product-parts/{product_part_id}")
async def delete_product_part(
    product_part_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    product_part = db.query(ProductPart).options(
        joinedload(ProductPart.product)
    ).filter(ProductPart.id == product_part_id).first()

    if not product_part:
        raise HTTPException(status_code=404, detail="ProductPart not found")

    # Verificar acesso
    if current_user.role == "customer" and product_part.product.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")

    db.delete(product_part)
    db.commit()
    return {"message": "ProductPart deleted"}


@router.get("/products/{product_id}/parts", response_model=List[ProductPartResponse])
async def get_product_parts(
    product_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all parts associated with a product"""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Verificar acesso
    if current_user.role == "customer" and product.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")

    product_parts = db.query(ProductPart).options(
        joinedload(ProductPart.part)
    ).filter(ProductPart.product_id == product_id).all()

    return product_parts
