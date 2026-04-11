from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import User, Customer
from app.schemas.schemas import UserCreate, UserUpdate, UserResponse
from app.core.security import require_admin, require_agent, get_current_user, get_password_hash

router = APIRouter()


@router.get("/users", response_model=List[UserResponse])
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin())
):
    query = db.query(User)
    
    if role:
        query = query.filter(User.role == role)
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    
    users = query.offset(skip).limit(limit).all()
    return users


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Só admin ou próprio user pode editar
    if current_user.role != "admin" and str(current_user.id) != str(user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    for key, value in user_data.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin())
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.is_active = False
    db.commit()
    return {"message": "User deactivated"}


@router.get("/agents", response_model=List[UserResponse])
async def list_agents(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent())
):
    agents = db.query(User).filter(User.role == "agent", User.is_active == True).all()
    return agents


@router.post("/customers/{customer_id}/users", response_model=UserResponse)
async def create_user_for_customer(
    customer_id: UUID,
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin())
):
    # Verificar se customer existe
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Verificar se email já existe
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user = User(
        customer_id=customer_id,
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        name=user_data.name,
        role=user_data.role,
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
