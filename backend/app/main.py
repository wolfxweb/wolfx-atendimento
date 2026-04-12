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
def seed_all(db: Session):
    """Cria dados iniciais do sistema (idempotente)"""
    from app.models.models import User, Customer, Agent
    from app.core.security import get_password_hash

    # 1. Customer default
    customer = db.query(Customer).filter(Customer.email == "admin@wolfx.com").first()
    if not customer:
        customer = Customer(name="WolfX Sistema", email="admin@wolfx.com", is_active=True)
        db.add(customer)
        db.commit()
        db.flush()
        print("Customer created: WolfX Sistema")

    # 2. Admin user
    if not db.query(User).filter(User.email == "admin@wolfx.com").first():
        admin = User(
            customer_id=customer.id,
            email="admin@wolfx.com",
            password_hash=get_password_hash("Admin@123"),
            name="Administrador",
            role="admin",
            telegram_chat_id="1229273513",
            telegram_username="wolfxweb",
            is_active=True
        )
        db.add(admin)
        db.commit()
        print("Admin created: admin@wolfx.com / Admin@123")

    # 3. Agent 1
    if not db.query(User).filter(User.email == "agente@wolfx.com").first():
        agent = User(
            customer_id=None,
            email="agente@wolfx.com",
            password_hash=get_password_hash("Agente@123"),
            name="João Agent",
            role="agent",
            telegram_chat_id="1229273513",
            is_active=True
        )
        db.add(agent)
        db.commit()
        db.flush()
        if not db.query(Agent).filter(Agent.user_id == agent.id).first():
            ap = Agent(user_id=agent.id, team="Suporte", status="available", max_tickets=10)
            db.add(ap)
            db.commit()
        print("Agent created: agente@wolfx.com / Agente@123")

    # 4. Agent 2
    if not db.query(User).filter(User.email == "joao.agente@wolfx.com").first():
        agent2 = User(
            customer_id=None,
            email="joao.agente@wolfx.com",
            password_hash=get_password_hash("Agente@123"),
            name="João Silva",
            role="agent",
            telegram_chat_id="1229273513",
            is_active=True
        )
        db.add(agent2)
        db.commit()
        db.flush()
        if not db.query(Agent).filter(Agent.user_id == agent2.id).first():
            ap2 = Agent(user_id=agent2.id, team="Suporte", status="available", max_tickets=10)
            db.add(ap2)
            db.commit()
        print("Agent created: joao.agente@wolfx.com / Agente@123")

    # 5. Customer user
    if not db.query(User).filter(User.email == "cliente2@wolfx.com").first():
        customer_user = User(
            customer_id=customer.id,
            email="cliente2@wolfx.com",
            password_hash=get_password_hash("Cliente@123"),
            name="Carlos Cliente",
            role="customer",
            telegram_chat_id="1229273513",
            is_active=True
        )
        db.add(customer_user)
        db.commit()
        print("Customer created: cliente2@wolfx.com / Cliente@123")


def seed_categories(db: Session):
    """Cria categorias padrão (idempotente)"""
    categories = [
        {"name": "Eletrónicos", "slug": "eletronicos", "type": "product", "color": "#3B82F6", "icon": "cpu"},
        {"name": "Móveis", "slug": "moveis", "type": "product", "color": "#8B5CF6", "icon": "sofa"},
        {"name": "Roupas", "slug": "roupas", "type": "product", "color": "#EC4899", "icon": "shirt"},
        {"name": "Alimentação", "slug": "alimentacao", "type": "product", "color": "#10B981", "icon": "apple"},
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
            db.add(Category(**cat_data))
    db.commit()
    print("Categories seeded")


def seed_sla_default(db: Session):
    """Cria SLA global padrão (idempotente)"""
    if db.query(SLA).filter(SLA.is_default == True).first():
        return
    sla_defaults = [
        {"priority": "low", "name": "SLA Low", "first_response_minutes": 480, "resolution_minutes": 2880},
        {"priority": "normal", "name": "SLA Normal", "first_response_minutes": 240, "resolution_minutes": 1440},
        {"priority": "high", "name": "SLA High", "first_response_minutes": 60, "resolution_minutes": 480},
        {"priority": "urgent", "name": "SLA Urgent", "first_response_minutes": 15, "resolution_minutes": 240},
    ]
    for sla_data in sla_defaults:
        db.add(SLA(**sla_data, is_default=True, is_active=True,
                   business_hours_only=True, business_start_hour=9,
                   business_end_hour=18, business_days=[1, 2, 3, 4, 5]))
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
        seed_all(db)
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
from app.api.routes import auth, customers, users, agents, categories, products, tickets, sla, telegram_webhook

app.include_router(auth.router, prefix=settings.API_V1_PREFIX, tags=["auth"])
app.include_router(customers.router, prefix=settings.API_V1_PREFIX, tags=["customers"])
app.include_router(users.router, prefix=settings.API_V1_PREFIX, tags=["users"])
app.include_router(agents.router, prefix=settings.API_V1_PREFIX, tags=["agents"])
app.include_router(categories.router, prefix=settings.API_V1_PREFIX, tags=["categories"])
app.include_router(products.router, prefix=settings.API_V1_PREFIX, tags=["products"])
app.include_router(tickets.router, prefix=settings.API_V1_PREFIX, tags=["tickets"])
app.include_router(sla.router, prefix=settings.API_V1_PREFIX, tags=["sla"])
app.include_router(telegram_webhook.router, prefix=settings.API_V1_PREFIX, tags=["telegram"])


@app.get("/")
async def root():
    return {"message": "WolfX Atendimento API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
