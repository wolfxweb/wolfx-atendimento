import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Boolean, DateTime, ForeignKey,
    Numeric, Integer, JSON, Enum as SAEnum
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.database import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    AGENT = "agent"
    CUSTOMER = "customer"


class TicketStatus(str, enum.Enum):
    OPEN = "open"
    PENDING = "pending"
    SOLVED = "solved"
    CLOSED = "closed"
    REOPENED = "reopened"


class TicketPriority(str, enum.Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class SLAStatus(str, enum.Enum):
    WITHIN = "within"
    AT_RISK = "at_risk"
    BREACHED = "breached"


class AgentStatus(str, enum.Enum):
    AVAILABLE = "available"
    AWAY = "away"
    OFFLINE = "offline"


class ApprovalAction(str, enum.Enum):
    APPROVED = "approved"
    REJECTED = "rejected"


class CategoryType(str, enum.Enum):
    PRODUCT = "product"
    TICKET = "ticket"


# =====================
# CUSTOMER (Empresa)
# =====================
class Customer(Base):
    __tablename__ = "customers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    document = Column(String(50), nullable=True)
    phone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    address = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacionamentos
    users = relationship("User", back_populates="customer")
    products = relationship("Product", back_populates="customer")
    tickets = relationship("Ticket", back_populates="customer")


# =====================
# USER
# =====================
class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(100), nullable=False)
    role = Column(String(20), nullable=False, default=UserRole.CUSTOMER.value)
    phone = Column(String(20), nullable=True)
    telegram_chat_id = Column(String(50), nullable=True)
    telegram_username = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacionamentos
    customer = relationship("Customer", back_populates="users")
    tickets_created = relationship("Ticket", back_populates="creator", foreign_keys="Ticket.created_by")
    assigned_tickets = relationship("Ticket", back_populates="agent", foreign_keys="Ticket.agent_id")
    comments = relationship("Comment", back_populates="author")
    approvals = relationship("TicketApproval", back_populates="user")


# =====================
# AGENT (extensão de User)
# =====================
class Agent(Base):
    __tablename__ = "agents"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    team = Column(String(50), nullable=True)
    status = Column(String(20), default=AgentStatus.AVAILABLE.value)
    max_tickets = Column(Integer, default=10)

    user = relationship("User", backref=__tablename__)


# =====================
# CATEGORY
# =====================
class Category(Base):
    __tablename__ = "categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    type = Column(String(20), nullable=False)  # product ou ticket
    description = Column(Text, nullable=True)
    color = Column(String(7), default="#3B82F6")
    icon = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)
    order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacionamentos
    products = relationship("Product", back_populates="category")
    tickets = relationship("Ticket", back_populates="category")


# =====================
# PRODUCT
# =====================
class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True)
    name = Column(String(200), nullable=False)
    sku = Column(String(50), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    images = Column(JSON, default=list)
    price = Column(Numeric(10, 2), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacionamentos
    customer = relationship("Customer", back_populates="products")
    category = relationship("Category", back_populates="products")
    tickets = relationship("Ticket", back_populates="product")


# =====================
# TICKET
# =====================
class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(20), default=TicketStatus.OPEN.value)
    priority = Column(String(20), default=TicketPriority.NORMAL.value)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True)
    photos = Column(JSON, default=list)
    tags = Column(JSON, default=list)
    sla_status = Column(String(20), default=SLAStatus.WITHIN.value)
    requires_approval = Column(Boolean, default=True)
    approved_at = Column(DateTime, nullable=True)
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    resolution_summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacionamentos
    customer = relationship("Customer", back_populates="tickets")
    creator = relationship("User", back_populates="tickets_created", foreign_keys=[created_by])
    agent = relationship("User", back_populates="assigned_tickets", foreign_keys=[agent_id])
    product = relationship("Product", back_populates="tickets")
    category = relationship("Category", back_populates="tickets")
    comments = relationship("Comment", back_populates="ticket", order_by="Comment.created_at")
    approvals = relationship("TicketApproval", back_populates="ticket")


# =====================
# COMMENT
# =====================
class Comment(Base):
    __tablename__ = "comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id = Column(UUID(as_uuid=True), ForeignKey("tickets.id"), nullable=False)
    author_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    is_public = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relacionamentos
    ticket = relationship("Ticket", back_populates="comments")
    author = relationship("User", back_populates="comments")


# =====================
# TICKET APPROVAL
# =====================
class TicketApproval(Base):
    __tablename__ = "ticket_approvals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id = Column(UUID(as_uuid=True), ForeignKey("tickets.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    action = Column(String(20), nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relacionamentos
    ticket = relationship("Ticket", back_populates="approvals")
    user = relationship("User", back_populates="approvals")


# =====================
# MENU ITEM
# =====================
class MenuItem(Base):
    __tablename__ = "menu_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category = Column(String(100), nullable=False)  # e.g. "Gestao", "Configuracoes"
    title = Column(String(200), nullable=False)     # e.g. "Tickets", "Clientes"
    href = Column(String(500), nullable=False)      # e.g. "/admin/tickets"
    icon = Column(String(50), nullable=True)       # e.g. "ticket", "users"
    order = Column(Integer, default=0)               # sort order within category
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# =====================
# SLA
# =====================
class SLA(Base):
    __tablename__ = "slas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=True, unique=True)
    name = Column(String(100), nullable=False)
    priority = Column(String(20), nullable=False)
    first_response_minutes = Column(Integer, nullable=False)
    resolution_minutes = Column(Integer, nullable=False)
    business_hours_only = Column(Boolean, default=True)
    business_start_hour = Column(Integer, default=9)
    business_end_hour = Column(Integer, default=18)
    business_days = Column(JSON, default=[1, 2, 3, 4, 5])
    is_active = Column(Boolean, default=True)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacionamentos
    customer = relationship("Customer", backref="sla")
