from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.models import ProductComposition, Product, User
from app.schemas.schemas import ProductCompositionCreate, ProductCompositionUpdate, ProductCompositionResponse
from app.core.security import get_current_user

router = APIRouter()


@router.get("/product-compositions", response_model=List[ProductCompositionResponse])
async def list_product_compositions(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    product_id: Optional[UUID] = None,
    component_product_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(ProductComposition).options(
        joinedload(ProductComposition.component_product)
    )

    if product_id:
        query = query.filter(ProductComposition.product_id == product_id)

    if component_product_id:
        query = query.filter(ProductComposition.component_product_id == component_product_id)

    # Verificar acesso por produto
    if current_user.role == "customer":
        query = query.join(Product).filter(Product.customer_id == current_user.customer_id)

    compositions = query.offset(skip).limit(limit).all()
    return compositions


@router.post("/product-compositions", response_model=ProductCompositionResponse)
async def create_product_composition(
    composition_data: ProductCompositionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verificar se o produto (pai) existe
    product = db.query(Product).filter(Product.id == composition_data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Verificar acesso ao produto
    if current_user.role == "customer" and product.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Verificar se o componente existe
    component = db.query(Product).filter(Product.id == composition_data.component_product_id).first()
    if not component:
        raise HTTPException(status_code=404, detail="Component product not found")

    # Verificar acesso ao componente
    if current_user.role == "customer" and component.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Não permitir auto-composição (produto não pode ser componente de si mesmo)
    if composition_data.product_id == composition_data.component_product_id:
        raise HTTPException(status_code=400, detail="A product cannot be a component of itself")

    # Verificar se já existe a associação
    existing = db.query(ProductComposition).filter(
        ProductComposition.product_id == composition_data.product_id,
        ProductComposition.component_product_id == composition_data.component_product_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Composition already exists")

    composition = ProductComposition(**composition_data.model_dump())
    db.add(composition)
    db.commit()
    db.refresh(composition)
    return composition


@router.get("/product-compositions/{composition_id}", response_model=ProductCompositionResponse)
async def get_product_composition(
    composition_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    composition = db.query(ProductComposition).options(
        joinedload(ProductComposition.component_product)
    ).filter(ProductComposition.id == composition_id).first()

    if not composition:
        raise HTTPException(status_code=404, detail="Composition not found")

    # Verificar acesso
    if current_user.role == "customer":
        component = db.query(Product).filter(Product.id == composition.component_product_id).first()
        if not component or component.customer_id != current_user.customer_id:
            raise HTTPException(status_code=403, detail="Access denied")

    return composition


@router.patch("/product-compositions/{composition_id}", response_model=ProductCompositionResponse)
async def update_product_composition(
    composition_id: UUID,
    composition_data: ProductCompositionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    composition = db.query(ProductComposition).options(
        joinedload(ProductComposition.component_product)
    ).filter(ProductComposition.id == composition_id).first()

    if not composition:
        raise HTTPException(status_code=404, detail="Composition not found")

    # Verificar acesso
    if current_user.role == "customer":
        component = db.query(Product).filter(Product.id == composition.component_product_id).first()
        if not component or component.customer_id != current_user.customer_id:
            raise HTTPException(status_code=403, detail="Access denied")

    for key, value in composition_data.model_dump(exclude_unset=True).items():
        setattr(composition, key, value)

    db.commit()
    db.refresh(composition)
    return composition


@router.delete("/product-compositions/{composition_id}")
async def delete_product_composition(
    composition_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    composition = db.query(ProductComposition).filter(
        ProductComposition.id == composition_id
    ).first()

    if not composition:
        raise HTTPException(status_code=404, detail="Composition not found")

    # Verificar acesso
    if current_user.role == "customer":
        component = db.query(Product).filter(Product.id == composition.component_product_id).first()
        if not component or component.customer_id != current_user.customer_id:
            raise HTTPException(status_code=403, detail="Access denied")

    db.delete(composition)
    db.commit()
    return {"message": "Composition deleted"}


@router.get("/products/{product_id}/compositions", response_model=List[ProductCompositionResponse])
async def get_product_compositions(
    product_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all component products that compose a product"""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Verificar acesso
    if current_user.role == "customer" and product.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")

    compositions = db.query(ProductComposition).options(
        joinedload(ProductComposition.component_product)
    ).filter(ProductComposition.product_id == product_id).all()

    return compositions
