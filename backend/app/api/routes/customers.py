from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Customer, User, Ticket, Product
from app.schemas.schemas import CustomerCreate, CustomerUpdate, CustomerResponse
from app.core.security import require_admin, get_current_user

router = APIRouter()


@router.get("/customers", response_model=List[CustomerResponse])
async def list_customers(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin())
):
    query = db.query(Customer)
    
    if search:
        query = query.filter(Customer.name.ilike(f"%{search}%"))
    if is_active is not None:
        query = query.filter(Customer.is_active == is_active)
    
    customers = query.offset(skip).limit(limit).all()
    return customers


@router.post("/customers", response_model=CustomerResponse)
async def create_customer(
    customer_data: CustomerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin())
):
    customer = Customer(**customer_data.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/customers/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.patch("/customers/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: UUID,
    customer_data: CustomerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin())
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    for key, value in customer_data.model_dump(exclude_unset=True).items():
        setattr(customer, key, value)
    
    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/customers/{customer_id}")
async def delete_customer(
    customer_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin())
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    customer.is_active = False
    db.commit()
    return {"message": "Customer deactivated"}


@router.get("/customers/{customer_id}/tickets", response_model=List)
async def get_customer_tickets(
    customer_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verificar acesso
    if current_user.role == "customer" and str(current_user.customer_id) != str(customer_id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    tickets = db.query(Ticket).filter(Ticket.customer_id == customer_id).all()
    return tickets


@router.get("/customers/{customer_id}/products", response_model=List)
async def get_customer_products(
    customer_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verificar acesso
    if current_user.role == "customer" and str(current_user.customer_id) != str(customer_id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    products = db.query(Product).filter(Product.customer_id == customer_id).all()
    return products


@router.get("/customers/{customer_id}/users", response_model=List)
async def get_customer_users(
    customer_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verificar acesso
    if current_user.role == "customer" and str(current_user.customer_id) != str(customer_id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    users = db.query(User).filter(User.customer_id == customer_id).all()
    return users
