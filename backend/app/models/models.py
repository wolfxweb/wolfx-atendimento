import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Boolean, DateTime, ForeignKey,
    Numeric, Integer, JSON, Enum as SAEnum, Date, UniqueConstraint, Table, Index
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, backref
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
    # Address fields (all nullable)
    address_street = Column(String(255), nullable=True)
    address_number = Column(String(20), nullable=True)
    address_complement = Column(String(100), nullable=True)
    address_district = Column(String(100), nullable=True)
    address_city = Column(String(100), nullable=True)
    address_state = Column(String(100), nullable=True)
    address_zip = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacionamentos
    users = relationship("User", back_populates="customer")
    products = relationship("Product", back_populates="customer")
    tickets = relationship("Ticket", back_populates="customer")
    parts = relationship("Part", back_populates="customer")


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

    # HR fields (nullable)
    birth_date = Column(Date, nullable=True)
    cpf = Column(String(20), nullable=True)
    rg = Column(String(20), nullable=True)
    gender = Column(String(20), nullable=True)
    marital_status = Column(String(20), nullable=True)
    address_street = Column(String(255), nullable=True)
    address_city = Column(String(100), nullable=True)
    address_state = Column(String(100), nullable=True)
    address_zip = Column(String(20), nullable=True)
    emergency_contact_name = Column(String(100), nullable=True)
    emergency_contact_phone = Column(String(20), nullable=True)
    emergency_contact_relation = Column(String(50), nullable=True)
    position = Column(String(100), nullable=True)
    department = Column(String(100), nullable=True)
    hire_date = Column(Date, nullable=True)
    salary = Column(Numeric(12, 2), nullable=True)
    work_shift = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)

    # Relacionamentos
    customer = relationship("Customer", back_populates="users")
    tickets_created = relationship("Ticket", back_populates="creator", foreign_keys="Ticket.created_by")
    assigned_tickets = relationship("Ticket", back_populates="agent", foreign_keys="Ticket.agent_id")
    comments = relationship("Comment", back_populates="author")
    approvals = relationship("TicketApproval", back_populates="user")
    # AI Module Phase 1
    ai_approvals = relationship("AIApproval", back_populates="approver")
    ai_feedback_evaluations = relationship("AIApprovalFeedback", back_populates="evaluator")


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

    # Hierarquia
    parent_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True)
    children = relationship("Category", backref="parent", remote_side=[id])


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
    cost_price = Column(Numeric(10, 2), nullable=True)          # preço de custo
    brand = Column(String(100), nullable=True)                   # marca
    model = Column(String(100), nullable=True)                   # modelo
    barcode = Column(String(50), nullable=True)                   # código de barras
    stock_quantity = Column(Integer, default=0)                 # quantidade em stock
    min_stock = Column(Integer, nullable=True)                   # alerta stock mínimo
    weight = Column(Numeric(8, 3), nullable=True)               # peso em kg
    dimensions = Column(String(50), nullable=True)               # LxAxP cm
    warranty_months = Column(Integer, nullable=True)            # meses de garantia
    supplier = Column(String(200), nullable=True)                # fornecedor
    product_url = Column(String(500), nullable=True)             # url do produto
    notes = Column(Text, nullable=True)                          # notas internas
    tax_rate = Column(Numeric(5, 2), nullable=True)             # taxa de imposto %
    is_active = Column(Boolean, default=True)                   # produto activo
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacionamentos
    customer = relationship("Customer", back_populates="products")
    category = relationship("Category", back_populates="products")
    tickets = relationship("Ticket", back_populates="product")
    product_parts = relationship("ProductPart", back_populates="product")
    compositions = relationship("ProductComposition", back_populates="product", foreign_keys="ProductComposition.product_id")


# =====================
# PART
# =====================
class Part(Base):
    __tablename__ = "parts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=False)
    name = Column(String(200), nullable=False)
    sku = Column(String(50), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    cost_price = Column(Numeric(10, 2), nullable=False)       # preço de custo
    sale_price = Column(Numeric(10, 2), nullable=False)         # preço de venda
    estimated_time = Column(Integer, nullable=True)             # tempo estimado em minutos
    image = Column(String(500), nullable=True)                  # URL da imagem
    is_kit = Column(Boolean, default=False)                   # se é um kit
    parent_part_id = Column(UUID(as_uuid=True), ForeignKey("parts.id"), nullable=True)  # peça pai (se for kit)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacionamentos
    parent = relationship("Part", remote_side="Part.id", back_populates="children", foreign_keys=[parent_part_id])
    children = relationship("Part", back_populates="parent", foreign_keys=[parent_part_id])
    product_parts = relationship("ProductPart", back_populates="part")
    customer = relationship("Customer", back_populates="parts")


# =====================
# PRODUCT PART (junction table)
# =====================
class ProductPart(Base):
    __tablename__ = "product_parts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    part_id = Column(UUID(as_uuid=True), ForeignKey("parts.id"), nullable=False)
    quantity = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacionamentos
    product = relationship("Product", back_populates="product_parts")
    part = relationship("Part", back_populates="product_parts")


# =====================
# PRODUCT COMPOSITION (product composed of other products)
# =====================
class ProductComposition(Base):
    __tablename__ = "product_compositions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    component_product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacionamentos
    product = relationship("Product", back_populates="compositions", foreign_keys=[product_id])
    component_product = relationship("Product", foreign_keys=[component_product_id])


# =====================
# TICKET
# =====================
class TicketRelation(Base):
    __tablename__ = "ticket_relations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_ticket_id = Column(UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    target_ticket_id = Column(UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    source_ticket = relationship("Ticket", back_populates="ticket_relations", foreign_keys=[source_ticket_id])


# =====================
# TICKET COLLABORATOR
# =====================
class TicketCollaborator(Base):
    __tablename__ = "ticket_collaborators"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id = Column(UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    hours_spent = Column(Integer, default=0)
    minutes_spent = Column(Integer, default=0)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    ticket = relationship("Ticket", back_populates="ticket_collaborators")
    user = relationship("User")


# =====================
# TICKET PRODUCT
# =====================
class TicketProduct(Base):
    __tablename__ = "ticket_products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id = Column(UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False)
    quantity = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

    ticket = relationship("Ticket", back_populates="ticket_products")
    product = relationship("Product")


# =====================
# COMMENT
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
    sla_id = Column(UUID(as_uuid=True), ForeignKey("slas.id"), nullable=True)
    sla_response_limit = Column(DateTime, nullable=True)
    sla_resolution_limit = Column(DateTime, nullable=True)
    first_response_at = Column(DateTime, nullable=True)
    requires_approval = Column(Boolean, default=True)
    approved_at = Column(DateTime, nullable=True)
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    resolution_summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Novas colunas para hierarquia e controle de tempo
    parent_ticket_id = Column(UUID(as_uuid=True), ForeignKey("tickets.id"), nullable=True)
    opened_at = Column(DateTime, nullable=True)
    attended_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)

    # Relacionamentos
    customer = relationship("Customer", back_populates="tickets")
    parent_ticket = relationship("Ticket", remote_side=[id], backref="child_tickets")
    ticket_collaborators = relationship("TicketCollaborator", back_populates="ticket", cascade="all, delete-orphan")
    ticket_products = relationship("TicketProduct", back_populates="ticket", cascade="all, delete-orphan")
    creator = relationship("User", back_populates="tickets_created", foreign_keys=[created_by])
    agent = relationship("User", back_populates="assigned_tickets", foreign_keys=[agent_id])
    product = relationship("Product", back_populates="tickets")
    category = relationship("Category", back_populates="tickets")
    comments = relationship("Comment", back_populates="ticket", order_by="Comment.created_at")
    approvals = relationship("TicketApproval", back_populates="ticket")
    ticket_relations = relationship("TicketRelation", back_populates="source_ticket", cascade="all, delete-orphan", foreign_keys=[TicketRelation.source_ticket_id])
    sla = relationship("SLA", foreign_keys=[sla_id])
    # AI Module Phase 1
    ai_executions  = relationship("AIWorkflowExecution", back_populates="ticket")
    ai_approvals   = relationship("AIApproval", back_populates="ticket")
    ai_suggestions = relationship("AITicketSuggestion", back_populates="ticket")


# =====================
# TICKET RELATIONS
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
    parent_id = Column(UUID(as_uuid=True), ForeignKey("menu_items.id"), nullable=True)  # hierarchy support
    category = Column(String(100), nullable=False)  # e.g. "Gestao", "Configuracoes"
    title = Column(String(200), nullable=False)     # e.g. "Tickets", "Clientes"
    href = Column(String(500), nullable=False)      # e.g. "/admin/tickets"
    icon = Column(String(50), nullable=True)       # e.g. "ticket", "users"
    order = Column(Integer, default=0)               # sort order within category
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Self-referential relationship for sub-items
    children = relationship("MenuItem", backref=backref("parent", remote_side=[id]), foreign_keys=[parent_id])


# =====================
# SLA
# =====================
class SLA(Base):
    __tablename__ = "slas"
    __table_args__ = (
        UniqueConstraint('customer_id', 'priority', 'category_id', name='uq_sla_customer_priority_category'),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("customers.id"), nullable=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True)
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
    customer = relationship("Customer", backref="slas")
    category = relationship("Category", backref="slas")


# ─────────────────────────────────────────────
# Knowledge Base (KB)
# ─────────────────────────────────────────────

class KBArticleCategory(Base):
    __tablename__ = "kb_categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("kb_categories.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    parent = relationship("KBArticleCategory", remote_side=[id], backref="children")
    articles = relationship("KBArticle", back_populates="category")


class KBArticle(Base):
    __tablename__ = "kb_articles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("kb_categories.id"), nullable=True)
    status = Column(String(20), default="draft")  # draft | published
    author_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    views = Column(Integer, default=0)
    useful_count = Column(Integer, default=0)
    not_useful_count = Column(Integer, default=0)
    embedding_status = Column(String(20), nullable=True)  # null | pending | indexed | failed
    chunk_count = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category = relationship("KBArticleCategory", back_populates="articles")
    author = relationship("User")
    attachments = relationship("KBAttachment", back_populates="article", cascade="all, delete-orphan")
    tags = relationship("KBTag", secondary="kb_article_tags", back_populates="articles")


kb_article_tags = Table(
    "kb_article_tags",
    Base.metadata,
    Column("article_id", UUID(as_uuid=True), ForeignKey("kb_articles.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", UUID(as_uuid=True), ForeignKey("kb_tags.id", ondelete="CASCADE"), primary_key=True),
)


class KBTag(Base):
    __tablename__ = "kb_tags"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(50), nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    articles = relationship("KBArticle", secondary=kb_article_tags, back_populates="tags")


class KBAttachment(Base):
    __tablename__ = "kb_attachments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    article_id = Column(UUID(as_uuid=True), ForeignKey("kb_articles.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    mime_type = Column(String(100), nullable=True)
    file_size = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    article = relationship("KBArticle", back_populates="attachments")


class AIEmbedding(Base):
    """Stored embedding chunks for RAG semantic search."""
    __tablename__ = "ai_embeddings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    article_id = Column(UUID(as_uuid=True), ForeignKey("kb_articles.id", ondelete="CASCADE"), nullable=False)
    source_type = Column(String(30), nullable=False)  # 'article_body' | 'article_attachment' | 'ticket_history'
    source_id = Column(UUID(as_uuid=True), nullable=True)  # attachment_id for PDFs
    chunk_index = Column(Integer, nullable=False)
    content_chunk = Column(Text, nullable=False)
    embedding = Column(JSON, nullable=True)  # List[float] stored as JSON (dim=1024)
    chunk_metadata = Column(JSON, nullable=True)  # {page, filename, char_count}
    created_at = Column(DateTime, default=datetime.utcnow)

    article = relationship("KBArticle", backref=backref("embeddings", cascade="all, delete-orphan"))

    __table_args__ = (
        Index("idx_emb_article", "article_id"),
        Index("idx_emb_source", "article_id", "source_type"),
    )


class AIRagDocument(Base):
    """RAG document — either an uploaded PDF or a KB article indexed for semantic search."""
    __tablename__ = "ai_rag_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    article_id = Column(UUID(as_uuid=True), ForeignKey("kb_articles.id", ondelete="CASCADE"), nullable=True)  # null = standalone PDF
    title = Column(String(500), nullable=False)
    file_path = Column(String(500), nullable=True)  # null for KB articles (no PDF file)
    original_filename = Column(String(500), nullable=False)
    mime_type = Column(String(100), nullable=False, default="application/pdf")
    file_size = Column(Integer, nullable=True)
    status = Column(String(30), nullable=False, default="pending")  # pending | processing | indexed | failed
    chunk_count = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    embedded_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    chunks = relationship("AIRagChunk", back_populates="rag_document", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_rag_doc_status", "status"),
    )


class AIRagChunk(Base):
    """Embedding chunks for standalone AIRagDocument PDFs."""
    __tablename__ = "ai_rag_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rag_document_id = Column(UUID(as_uuid=True), ForeignKey("ai_rag_documents.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    content_chunk = Column(Text, nullable=False)
    embedding = Column(JSON, nullable=True)  # List[float] dim=1024
    chunk_metadata = Column(JSON, nullable=True)  # {page, char_count}
    created_at = Column(DateTime, default=datetime.utcnow)

    rag_document = relationship("AIRagDocument", back_populates="chunks")

    __table_args__ = (
        Index("idx_rag_chunk_doc", "rag_document_id"),
    )
