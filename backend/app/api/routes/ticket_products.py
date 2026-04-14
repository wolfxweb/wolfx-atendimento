from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import TicketProduct, Ticket, Product, User
from app.schemas.schemas import TicketProductCreate, TicketProductUpdate, TicketProductResponse
from app.core.security import get_current_user

router = APIRouter()


@router.get("/ticket-products", response_model=List[TicketProductResponse])
async def list_ticket_products(
    ticket_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(TicketProduct)
    if ticket_id:
        query = query.filter(TicketProduct.ticket_id == ticket_id)
    items = query.all()
    result = []
    for item in items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        result.append(TicketProductResponse(
            id=item.id,
            ticket_id=item.ticket_id,
            product_id=item.product_id,
            quantity=item.quantity,
            created_at=item.created_at,
            product_name=product.name if product else None
        ))
    return result


@router.post("/ticket-products", response_model=TicketProductResponse)
async def create_ticket_product(
    data: TicketProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ticket = db.query(Ticket).filter(Ticket.id == data.ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    product = db.query(Product).filter(Product.id == data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    item = TicketProduct(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    
    return TicketProductResponse(
        id=item.id,
        ticket_id=item.ticket_id,
        product_id=item.product_id,
        quantity=item.quantity,
        created_at=item.created_at,
        product_name=product.name if product else None
    )


@router.patch("/ticket-products/{item_id}", response_model=TicketProductResponse)
async def update_ticket_product(
    item_id: UUID,
    data: TicketProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(TicketProduct).filter(TicketProduct.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    
    db.commit()
    db.refresh(item)
    
    product = db.query(Product).filter(Product.id == item.product_id).first()
    return TicketProductResponse(
        id=item.id,
        ticket_id=item.ticket_id,
        product_id=item.product_id,
        quantity=item.quantity,
        created_at=item.created_at,
        product_name=product.name if product else None
    )


@router.delete("/ticket-products/{item_id}")
async def delete_ticket_product(
    item_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(TicketProduct).filter(TicketProduct.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    db.delete(item)
    db.commit()
    return {"message": "Product removed from ticket"}
