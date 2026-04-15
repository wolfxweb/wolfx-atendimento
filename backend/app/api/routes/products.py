from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
import os
import uuid
import aiofiles

from app.database import get_db
from app.models.models import Product, Category, User
from app.schemas.schemas import ProductCreate, ProductUpdate, ProductResponse
from sqlalchemy.orm import joinedload
from app.core.security import require_agent, get_current_user
from app.config import settings

router = APIRouter()


def save_file(file: UploadFile, subdir: str = "products") -> dict:
    """Salva ficheiro e retorna info"""
    ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, subdir, filename)
    
    # Criar dir se não existir
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    
    return {"filename": filename, "filepath": filepath, "url": f"/uploads/{subdir}/{filename}"}


@router.get("/products", response_model=List[ProductResponse])
async def list_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    customer_id: Optional[UUID] = None,
    category_id: Optional[UUID] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Product).options(joinedload(Product.category))
    
    # Customers só veem os seus próprios produtos
    if current_user.role == "customer":
        query = query.filter(Product.customer_id == current_user.customer_id)
    elif customer_id:
        query = query.filter(Product.customer_id == customer_id)
    
    if category_id:
        query = query.filter(Product.category_id == category_id)
    
    if search:
        query = query.filter(
            (Product.name.ilike(f"%{search}%")) |
            (Product.sku.ilike(f"%{search}%"))
        )
    
    products = query.order_by(Product.id.desc()).offset(skip).limit(limit).all()
    return products


@router.post("/products", response_model=ProductResponse)
async def create_product(
    product_data: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    import re
    import random
    import string

    # Gerar SKU automático a partir do nome se não fornecido
    if not product_data.sku:
        # Criar base do SKU: primeiro 3 chars do nome em maiúsculas, sem espaços
        name_part = re.sub(r'[^a-zA-Z0-9]', '', product_data.name)[:4].upper()
        random_part = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
        sku = f"{name_part}-{random_part}"
    else:
        sku = product_data.sku

    # Garantir que SKU é único (adicionar sufixo se necessário)
    base_sku = sku
    counter = 1
    while db.query(Product).filter(Product.sku == sku).first():
        sku = f"{base_sku}-{counter}"
        counter += 1

    product = Product(
        name=product_data.name,
        sku=sku,
        description=product_data.description,
        category_id=product_data.category_id,
        price=product_data.price,
        cost_price=product_data.cost_price,
        brand=product_data.brand,
        model=product_data.model,
        barcode=product_data.barcode,
        stock_quantity=product_data.stock_quantity or 0,
        min_stock=product_data.min_stock,
        weight=product_data.weight,
        dimensions=product_data.dimensions,
        warranty_months=product_data.warranty_months,
        supplier=product_data.supplier,
        product_url=product_data.product_url,
        notes=product_data.notes,
        tax_rate=product_data.tax_rate,
        is_active=product_data.is_active if product_data.is_active is not None else True,
        customer_id=current_user.customer_id
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    product = db.query(Product).options(joinedload(Product.category)).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Verificar acesso
    if current_user.role == "customer" and product.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return product


@router.patch("/products/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: UUID,
    product_data: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Verificar acesso
    if current_user.role == "customer" and product.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    for key, value in product_data.model_dump(exclude_unset=True).items():
        setattr(product, key, value)
    
    db.commit()
    db.refresh(product)
    return product


@router.delete("/products/{product_id}")
async def delete_product(
    product_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Verificar acesso
    if current_user.role == "customer" and product.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Verificar se tem tickets associados
    if product.tickets:
        raise HTTPException(status_code=400, detail="Cannot delete product with associated tickets")
    
    db.delete(product)
    db.commit()
    return {"message": "Product deleted"}


@router.post("/products/{product_id}/images", response_model=dict)
async def upload_product_image(
    product_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Verificar acesso
    if current_user.role == "customer" and product.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Verificar limite de imagens
    if len(product.images) >= 10:
        raise HTTPException(status_code=400, detail="Maximum 10 images per product")
    
    # Verificar tipo
    if file.content_type not in ["image/jpeg", "image/png", "image/webp"]:
        raise HTTPException(status_code=400, detail="Only jpg, png, webp allowed")
    
    # Salvar
    file_info = save_file(file, f"products/{product_id}")
    async with aiofiles.open(file_info["filepath"], "wb") as f:
        content = await file.read()
        await f.write(content)
    
    # Atualizar product
    images = product.images or []
    images.append({"url": file_info["url"], "name": file_info["filename"]})
    product.images = images
    db.commit()
    
    return file_info


@router.delete("/products/{product_id}/images/{image_name}")
async def delete_product_image(
    product_id: UUID,
    image_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Verificar acesso
    if current_user.role == "customer" and product.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Remover imagem
    images = [img for img in (product.images or []) if img.get("name") != image_name]
    product.images = images
    db.commit()
    
    return {"message": "Image deleted"}
