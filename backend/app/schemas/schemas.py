from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr, Field
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
    address: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    document: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


class CustomerResponse(BaseModel):
    id: UUID
    name: str
    document: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    address: Optional[str]
    is_active: bool
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

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None


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
    sku: str = Field(..., min_length=1)
    description: Optional[str] = None
    category_id: Optional[UUID] = None
    price: Optional[float] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[UUID] = None
    price: Optional[float] = None


class ProductResponse(BaseModel):
    id: UUID
    customer_id: UUID
    category_id: Optional[UUID]
    name: str
    sku: str
    description: Optional[str]
    images: List[dict]
    price: Optional[float]
    created_at: datetime
    updated_at: datetime
    category: Optional["CategoryResponse"] = None

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


class TicketUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    agent_id: Optional[UUID] = None
    category_id: Optional[UUID] = None
    tags: Optional[List[str]] = None
    resolution_summary: Optional[str] = None


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
    category: str = Field(..., min_length=1, max_length=100)
    title: str = Field(..., min_length=1, max_length=200)
    href: str = Field(..., min_length=1, max_length=500)
    icon: Optional[str] = Field(None, max_length=50)
    order: int = 0


class MenuItemUpdate(BaseModel):
    category: Optional[str] = Field(None, min_length=1, max_length=100)
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    href: Optional[str] = Field(None, min_length=1, max_length=500)
    icon: Optional[str] = Field(None, max_length=50)
    order: Optional[int] = None
    is_active: Optional[bool] = None


class MenuItemResponse(BaseModel):
    id: UUID
    category: str
    title: str
    href: str
    icon: Optional[str]
    order: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
