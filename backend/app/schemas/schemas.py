from datetime import datetime, date
from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr, Field, field_validator
from uuid import UUID


# =====================
# AUTH
# =====================
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=2)
    role: str = "customer"
    customer_id: Optional[UUID] = None
    phone: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    # HR fields (nullable)
    birth_date: Optional[date] = None
    cpf: Optional[str] = None
    rg: Optional[str] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    hire_date: Optional[date] = None
    salary: Optional[float] = None
    work_shift: Optional[str] = None
    notes: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[str] = None


# =====================
# CUSTOMER
# =====================
class CustomerCreate(BaseModel):
    name: str = Field(..., min_length=2)
    document: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    # Address fields (all nullable)
    address_street: Optional[str] = None
    address_number: Optional[str] = None
    address_complement: Optional[str] = None
    address_district: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    notes: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    document: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    # Address fields (all nullable)
    address_street: Optional[str] = None
    address_number: Optional[str] = None
    address_complement: Optional[str] = None
    address_district: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class CustomerResponse(BaseModel):
    id: UUID
    name: str
    document: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    # Address fields (all nullable)
    address_street: Optional[str] = None
    address_number: Optional[str] = None
    address_complement: Optional[str] = None
    address_district: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    is_active: bool
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# =====================
# USER
# =====================
class UserResponse(BaseModel):
    id: UUID
    customer_id: Optional[UUID]
    email: str
    name: str
    role: str
    phone: Optional[str]
    is_active: bool
    created_at: datetime
    # HR fields (nullable)
    birth_date: Optional[date] = None
    cpf: Optional[str] = None
    rg: Optional[str] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    hire_date: Optional[date] = None
    salary: Optional[float] = None
    work_shift: Optional[str] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None
    # HR fields (nullable)
    birth_date: Optional[date] = None
    cpf: Optional[str] = None
    rg: Optional[str] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    hire_date: Optional[date] = None
    salary: Optional[float] = None
    work_shift: Optional[str] = None
    notes: Optional[str] = None


# =====================
# AGENT
# =====================
class AgentResponse(BaseModel):
    user_id: UUID
    team: Optional[str]
    status: str
    max_tickets: int

    class Config:
        from_attributes = True


class AgentUpdate(BaseModel):
    team: Optional[str] = None
    status: Optional[str] = None
    max_tickets: Optional[int] = Field(None, ge=1, le=100)


class AgentCreate(BaseModel):
    user_id: UUID
    team: Optional[str] = None
    status: str = "available"
    max_tickets: int = 10


class AgentListItem(BaseModel):
    """Resposta combinada de User + Agent para lista de agentes"""
    id: UUID
    customer_id: Optional[UUID]
    email: str
    name: str
    role: str
    phone: Optional[str]
    is_active: bool
    created_at: datetime
    team: Optional[str]
    status: str
    max_tickets: int

    class Config:
        from_attributes = True


# =====================
# CATEGORY
# =====================
class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=2)
    slug: str = Field(..., min_length=2)
    type: str  # product ou ticket
    description: Optional[str] = None
    color: Optional[str] = "#3B82F6"
    icon: Optional[str] = None
    order: Optional[int] = 0
    parent_id: Optional[UUID] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    order: Optional[int] = None
    is_active: Optional[bool] = None
    parent_id: Optional[UUID] = None


class CategoryResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    type: str
    description: Optional[str]
    color: str
    icon: Optional[str]
    is_active: bool
    order: int
    parent_id: Optional[UUID]
    created_at: datetime

    class Config:
        from_attributes = True


# =====================
# PRODUCT
# =====================
class ProductCreate(BaseModel):
    name: str = Field(..., min_length=2)
    sku: Optional[str] = Field(None, min_length=1)  # backend auto-generates if None
    description: Optional[str] = None
    category_id: Optional[UUID] = None
    price: Optional[float] = None
    cost_price: Optional[float] = None
    brand: Optional[str] = Field(None, max_length=100)
    model: Optional[str] = Field(None, max_length=100)
    barcode: Optional[str] = Field(None, max_length=50)
    stock_quantity: Optional[int] = 0
    min_stock: Optional[int] = None
    weight: Optional[float] = None
    dimensions: Optional[str] = Field(None, max_length=50)
    warranty_months: Optional[int] = None
    supplier: Optional[str] = Field(None, max_length=200)
    product_url: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = None
    tax_rate: Optional[float] = None
    is_active: Optional[bool] = True


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[UUID] = None
    price: Optional[float] = None
    cost_price: Optional[float] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    barcode: Optional[str] = None
    stock_quantity: Optional[int] = None
    min_stock: Optional[int] = None
    weight: Optional[float] = None
    dimensions: Optional[str] = None
    warranty_months: Optional[int] = None
    supplier: Optional[str] = None
    product_url: Optional[str] = None
    notes: Optional[str] = None
    tax_rate: Optional[float] = None
    is_active: Optional[bool] = None


class ProductResponse(BaseModel):
    id: UUID
    customer_id: UUID
    category_id: Optional[UUID]
    name: str
    sku: str
    description: Optional[str]
    images: List[dict]
    price: Optional[float]
    cost_price: Optional[float] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    barcode: Optional[str] = None
    stock_quantity: int = 0
    min_stock: Optional[int] = None
    weight: Optional[float] = None
    dimensions: Optional[str] = None
    warranty_months: Optional[int] = None
    supplier: Optional[str] = None
    product_url: Optional[str] = None
    notes: Optional[str] = None
    tax_rate: Optional[float] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    category: Optional["CategoryResponse"] = None

    class Config:
        from_attributes = True


# =====================
# PART
# =====================
class PartCreate(BaseModel):
    name: str = Field(..., min_length=2)
    sku: str = Field(..., min_length=1)
    description: Optional[str] = None
    cost_price: float = Field(..., ge=0)
    sale_price: float = Field(..., ge=0)
    estimated_time: Optional[str | int] = None  # DB is int (minutes)
    image: Optional[str] = None
    is_kit: bool = False
    parent_part_id: Optional[UUID] = None

    @field_validator("estimated_time", mode="before")
    @classmethod
    def estimate_time_to_int(cls, v):
        if v is None or v == "":
            return None
        if isinstance(v, str):
            return int(v) if v.strip() else None
        return v


class PartUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    description: Optional[str] = None
    cost_price: Optional[float] = Field(None, ge=0)
    sale_price: Optional[float] = Field(None, ge=0)
    estimated_time: Optional[str | int] = None
    image: Optional[str] = None
    is_kit: Optional[bool] = None
    parent_part_id: Optional[UUID] = None

    @field_validator("estimated_time", mode="before")
    @classmethod
    def estimate_time_to_int(cls, v):
        if v is None or v == "":
            return None
        if isinstance(v, str):
            return int(v) if v.strip() else None
        return v


class PartResponse(BaseModel):
    id: UUID
    name: str
    sku: str
    description: Optional[str]
    cost_price: float
    sale_price: float
    estimated_time: Optional[str | int]  # DB is int (minutes), schema accepts both
    image: Optional[str]
    is_kit: bool
    parent_part_id: Optional[UUID]
    children: List["PartResponse"] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    @field_validator("estimated_time", mode="before")
    @classmethod
    def estimate_time_to_str(cls, v):
        if v is None:
            return None
        return str(v) if isinstance(v, int) else v


# Rebuild PartResponse to resolve forward reference "PartResponse"
PartResponse.model_rebuild()


# =====================
# PRODUCT PART
# =====================
class ProductPartCreate(BaseModel):
    product_id: UUID
    part_id: UUID
    quantity: int = Field(default=1, ge=1)


class ProductPartUpdate(BaseModel):
    quantity: Optional[int] = Field(None, ge=1)


class ProductPartResponse(BaseModel):
    id: UUID
    product_id: UUID
    part_id: UUID
    quantity: int
    created_at: datetime
    updated_at: datetime
    part: Optional["PartResponse"] = None
    product: Optional["ProductResponse"] = None

    class Config:
        from_attributes = True


# =====================
# PRODUCT COMPOSITION (product composed of other products)
# =====================
class ProductCompositionCreate(BaseModel):
    product_id: UUID
    component_product_id: UUID
    quantity: int = Field(default=1, ge=1)


class ProductCompositionUpdate(BaseModel):
    quantity: Optional[int] = Field(None, ge=1)


class ProductCompositionResponse(BaseModel):
    id: UUID
    product_id: UUID
    component_product_id: UUID
    quantity: int
    created_at: datetime
    updated_at: datetime
    component_product: Optional["ProductResponse"] = None

    class Config:
        from_attributes = True


# =====================
# TICKET
# =====================
class TicketCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=10)
    priority: str = "normal"
    category_id: Optional[UUID] = None
    product_id: Optional[UUID] = None
    tags: Optional[List[str]] = []
    customer_id: Optional[UUID] = None  # só admin pode definir ao criar
    parent_ticket_id: Optional[UUID] = None
    # opened_at é definido automaticamente pelo backend na criação


class TicketUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    agent_id: Optional[UUID] = None
    category_id: Optional[UUID] = None
    product_id: Optional[UUID] = None
    tags: Optional[List[str]] = None
    resolution_summary: Optional[str] = None
    parent_ticket_id: Optional[UUID] = None
    # opened_at não pode ser alterado - é definido na criação
    attended_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None


class TicketResponse(BaseModel):
    id: UUID
    title: str
    description: str
    status: str
    priority: str
    customer_id: UUID
    created_by: UUID
    agent_id: Optional[UUID]
    product_id: Optional[UUID]
    category_id: Optional[UUID]
    photos: List[str]
    tags: List[str]
    sla_status: str
    requires_approval: bool
    approved_at: Optional[datetime]
    resolution_summary: Optional[str]
    created_at: datetime
    updated_at: datetime
    parent_ticket_id: Optional[UUID] = None
    opened_at: Optional[datetime] = None
    attended_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =====================
# TICKET RELATIONS
# =====================
class TicketRelationCreate(BaseModel):
    source_ticket_id: UUID
    target_ticket_id: UUID


class TicketRelationResponse(BaseModel):
    id: UUID
    source_ticket_id: UUID
    target_ticket_id: UUID
    created_at: datetime
    target_ticket_title: Optional[str] = None  # populated in route

    class Config:
        from_attributes = True


# =====================
# TICKET COLLABORATOR
# =====================
class TicketCollaboratorCreate(BaseModel):
    ticket_id: UUID
    user_id: UUID
    hours_spent: Optional[int] = 0
    minutes_spent: Optional[int] = 0
    notes: Optional[str] = None


class TicketCollaboratorUpdate(BaseModel):
    hours_spent: Optional[int] = None
    minutes_spent: Optional[int] = None
    notes: Optional[str] = None


class TicketCollaboratorResponse(BaseModel):
    id: UUID
    ticket_id: UUID
    user_id: UUID
    hours_spent: int
    minutes_spent: int
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    user_name: Optional[str] = None  # populated in route

    class Config:
        from_attributes = True


# =====================
# TICKET PRODUCT
# =====================
class TicketProductCreate(BaseModel):
    ticket_id: UUID
    product_id: UUID
    quantity: Optional[int] = 1


class TicketProductUpdate(BaseModel):
    quantity: Optional[int] = None


class TicketProductResponse(BaseModel):
    id: UUID
    ticket_id: UUID
    product_id: UUID
    quantity: int
    created_at: datetime
    product_name: Optional[str] = None  # populated in route

    class Config:
        from_attributes = True


# =====================
# COMMENT
# =====================
class CommentCreate(BaseModel):
    body: str = Field(..., min_length=1)
    is_public: bool = True


class CommentUpdate(BaseModel):
    body: Optional[str] = Field(None, min_length=1)
    is_public: Optional[bool] = None


class CommentResponse(BaseModel):
    id: UUID
    ticket_id: UUID
    author_id: UUID
    body: str
    is_public: bool
    created_at: datetime

    class Config:
        from_attributes = True


# =====================
# APPROVAL
# =====================
class ApprovalCreate(BaseModel):
    action: str  # approved ou rejected
    comment: Optional[str] = None


class ApprovalResponse(BaseModel):
    id: UUID
    ticket_id: UUID
    user_id: UUID
    action: str
    comment: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# =====================
# SLA
# =====================
class SLACreate(BaseModel):
    customer_id: Optional[UUID] = None
    name: str = Field(..., min_length=2)
    priority: str
    first_response_minutes: int
    resolution_minutes: int
    business_hours_only: bool = True
    business_start_hour: int = 9
    business_end_hour: int = 18
    business_days: List[int] = [1, 2, 3, 4, 5]


class SLAUpdate(BaseModel):
    name: Optional[str] = None
    first_response_minutes: Optional[int] = None
    resolution_minutes: Optional[int] = None
    business_hours_only: Optional[bool] = None
    business_start_hour: Optional[int] = None
    business_end_hour: Optional[int] = None
    business_days: Optional[List[int]] = None


class SLAResponse(BaseModel):
    id: UUID
    customer_id: Optional[UUID]
    name: str
    priority: str
    first_response_minutes: int
    resolution_minutes: int
    business_hours_only: bool
    business_start_hour: int
    business_end_hour: int
    business_days: List[int]
    is_active: bool
    is_default: bool
    created_at: datetime

    class Config:
        from_attributes = True


# =====================
# PAGINATION
# =====================
class PaginatedResponse(BaseModel):
    data: List[Any]
    total: int
    page: int
    per_page: int
    pages: int


# =====================
# MENU ITEM
# =====================
class MenuItemCreate(BaseModel):
    category: Optional[str] = Field(None, min_length=1, max_length=100)
    title: str = Field(..., min_length=1, max_length=200)
    href: str = Field(..., min_length=1, max_length=500)
    icon: Optional[str] = Field(None, max_length=50)
    order: int = 0
    parent_id: Optional[UUID] = None


class MenuItemUpdate(BaseModel):
    category: Optional[str] = Field(None, min_length=1, max_length=100)
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    href: Optional[str] = Field(None, min_length=1, max_length=500)
    icon: Optional[str] = Field(None, max_length=50)
    order: Optional[int] = None
    is_active: Optional[bool] = None
    parent_id: Optional[UUID] = None


class MenuItemResponse(BaseModel):
    id: UUID
    parent_id: Optional[UUID] = None
    category: Optional[str] = None
    title: str
    href: str
    icon: Optional[str]
    order: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
