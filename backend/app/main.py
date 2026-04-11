import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app.config import settings
from app.database import engine, Base, SessionLocal, get_db
from app.models.models import (
    User, Customer, Category, Product, Ticket,
    Comment, TicketApproval, SLA, Agent
)
from app.core.security import get_password_hash, create_access_token
from app.schemas.schemas import Token


# =====================
# SEED DATA
# =====================
def seed_admin(db: Session):
    """Cria admin default do sistema"""
    existing = db.query(User).filter(User.email == "admin@wolfx.com").first()
    if existing:
        return

    # Criar customer default (sistema)
    customer = Customer(
        name="WolfX Sistema",
        email="admin@wolfx.com",
        is_active=True
    )
    db.add(customer)
    db.flush()

    # Criar admin
    admin = User(
        customer_id=customer.id,
        email="admin@wolfx.com",
        password_hash=get_password_hash("Admin@123"),
        name="Administrador",
        role="admin",
        is_active=True
    )
    db.add(admin)
    db.commit()
    print("Admin created: admin@wolfx.com / Admin@123")


def seed_categories(db: Session):
    """Cria categorias padrão"""
    categories = [
        # Products
        {"name": "Eletrónicos", "slug": "eletronicos", "type": "product", "color": "#3B82F6", "icon": "cpu"},
        {"name": "Móveis", "slug": "moveis", "type": "product", "color": "#8B5CF6", "icon": "sofa"},
        {"name": "Roupas", "slug": "roupas", "type": "product", "color": "#EC4899", "icon": "shirt"},
        {"name": "Alimentação", "slug": "alimentacao", "type": "product", "color": "#10B981", "icon": "apple"},
        # Tickets
        {"name": "Suporte", "slug": "suporte", "type": "ticket", "color": "#EF4444", "icon": "question"},
        {"name": "Garantia", "slug": "garantia", "type": "ticket", "color": "#F59E0B", "icon": "shield"},
        {"name": "Devolução", "slug": "devolucao", "type": "ticket", "color": "#8B5CF6", "icon": "refresh"},
        {"name": "Dúvida", "slug": "duvida", "type": "ticket", "color": "#3B82F6", "icon": "help"},
        {"name": "Elogio", "slug": "elogio", "type": "ticket", "color": "#10B981", "icon": "star"},
        {"name": "Sugestão", "slug": "sugestao", "type": "ticket", "color": "#EC4899", "icon": "lightbulb"},
    ]

    for cat_data in categories:
        existing = db.query(Category).filter(Category.slug == cat_data["slug"]).first()
        if not existing:
            category = Category(**cat_data)
            db.add(category)
    
    db.commit()
    print("Categories seeded")


def seed_sla_default(db: Session):
    """Cria SLA global padrão"""
    existing = db.query(SLA).filter(SLA.is_default == True).first()
    if existing:
        return

    sla_defaults = [
        {"priority": "low", "name": "SLA Low", "first_response_minutes": 480, "resolution_minutes": 2880},
        {"priority": "normal", "name": "SLA Normal", "first_response_minutes": 240, "resolution_minutes": 1440},
        {"priority": "high", "name": "SLA High", "first_response_minutes": 60, "resolution_minutes": 480},
        {"priority": "urgent", "name": "SLA Urgent", "first_response_minutes": 15, "resolution_minutes": 240},
    ]

    for sla_data in sla_defaults:
        sla = SLA(
            **sla_data,
            is_default=True,
            is_active=True,
            business_hours_only=True,
            business_start_hour=9,
            business_end_hour=18,
            business_days=[1, 2, 3, 4, 5]
        )
        db.add(sla)
    
    db.commit()
    print("SLA defaults seeded")


# =====================
# LIFESPAN
# =====================
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    Base.metadata.create_all(bind=engine)
    
    # Seed data
    db = SessionLocal()
    try:
        seed_admin(db)
        seed_categories(db)
        seed_sla_default(db)
    finally:
        db.close()
    
    yield
    # Shutdown


# =====================
# APP
# =====================
app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: restrict to CORS_ORIGINS
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files (uploads)
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Include routers
from app.api.routes import auth, customers, users, categories, products, tickets, sla

app.include_router(auth.router, prefix=settings.API_V1_PREFIX, tags=["auth"])
app.include_router(customers.router, prefix=settings.API_V1_PREFIX, tags=["customers"])
app.include_router(users.router, prefix=settings.API_V1_PREFIX, tags=["users"])
app.include_router(categories.router, prefix=settings.API_V1_PREFIX, tags=["categories"])
app.include_router(products.router, prefix=settings.API_V1_PREFIX, tags=["products"])
app.include_router(tickets.router, prefix=settings.API_V1_PREFIX, tags=["tickets"])
app.include_router(sla.router, prefix=settings.API_V1_PREFIX, tags=["sla"])


@app.get("/")
async def root():
    return {"message": "WolfX Atendimento API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
