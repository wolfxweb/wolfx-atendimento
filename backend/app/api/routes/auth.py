from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import User, Customer
from app.schemas.schemas import UserCreate, UserLogin, Token, UserResponse
from app.core.security import (
    verify_password, get_password_hash, create_access_token,
    get_current_user
)
from app.config import settings

router = APIRouter()


@router.post("/auth/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    try:
        user = db.query(User).filter(User.email == form_data.username).first()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {str(e)}",
        )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        password_verified = verify_password(form_data.password, user.password_hash)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Password verification error: {str(e)}",
        )
    
    if not password_verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    try:
        access_token = create_access_token(
            data={"sub": str(user.id)},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Token creation error: {str(e)}",
        )
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/auth/register", response_model=UserResponse)
async def register(
    user_data: UserCreate,
    db: Session = Depends(get_db)
):
    # Verificar se email já existe
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Criar customer para o novo usuário
    customer = Customer(
        name=user_data.name,  # Usa o nome como nome da empresa inicialmente
        email=user_data.email,
        is_active=True
    )
    db.add(customer)
    db.flush()
    
    # Criar user
    user = User(
        customer_id=customer.id,
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


@router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user
