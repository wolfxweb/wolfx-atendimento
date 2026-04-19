"""
AI Module Pydantic Schemas - Phase 1
All AI approval/monitoring schemas
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, Literal
from pydantic import BaseModel, Field
from uuid import UUID


# ── Enums ────────────────────────────────────────────────────────
class WorkflowStatus(str):
    PENDING = "pending"
    RUNNING = "running"
    AWAITING_APPROVAL = "awaiting_approval"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    INTERRUPTED = "interrupted"


class ApprovalType(str):
    CLASSIFY_CONFIRM = "classify_confirm"
    RESPONSE_CONFIRM = "response_confirm"
    ESCALATE_CONFIRM = "escalate_confirm"
    CLOSE_CONFIRM = "close_confirm"
    SLA_OVERRIDE = "sla_override"


class HumanDecision(str):
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class FeedbackCorrectness(str):
    CORRECT = "correct"
    PARTIAL = "partial"
    WRONG = "wrong"
    UNNECESSARY = "unnecessary"


class RuleAction(str):
    AUTO_APPROVE = "auto_approve"
    AUTO_REJECT = "auto_reject"
    REQUIRE_REVIEW = "require_review"


# ── AIApproval Schemas ──────────────────────────────────────────
class AIApprovalBase(BaseModel):
    execution_id: UUID
    ticket_id: UUID
    approval_type: str
    step_description: str
    ai_suggestion: dict


class AIApprovalCreate(AIApprovalBase):
    pass


class AIApprovalUpdate(BaseModel):
    human_decision: Optional[str] = None
    human_notes: Optional[str] = None
    approver_user_id: Optional[UUID] = None
    approved_at: Optional[datetime] = None
    resume_checkpoint: Optional[dict] = None


class AIApprovalResponse(AIApprovalBase):
    id: UUID
    confidence: Optional[Decimal] = None
    ticket_priority: Optional[str] = None
    ticket_category: Optional[str] = None
    auto_skipped: bool
    matched_rule_id: Optional[UUID] = None
    dry_run: bool
    rule_action: Optional[str] = None
    human_decision: Optional[str] = None
    human_notes: Optional[str] = None
    approver_user_id: Optional[UUID] = None
    approved_at: Optional[datetime] = None
    created_at: datetime
    expires_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AIApprovalApproveRequest(BaseModel):
    notes: Optional[str] = None


class AIApprovalRejectRequest(BaseModel):
    notes: Optional[str] = None


# ── AIExecution Schemas ─────────────────────────────────────────
class AIExecutionBase(BaseModel):
    ticket_id: UUID
    workflow_name: str = 'ticket_ai_assistant'


class AIExecutionCreate(AIExecutionBase):
    payload: Optional[dict] = None


class AIExecutionUpdate(BaseModel):
    status: Optional[str] = None
    current_node: Optional[str] = None
    result: Optional[dict] = None
    error: Optional[str] = None
    thread_id: Optional[str] = None
    interrupted_at: Optional[datetime] = None
    interrupted_state: Optional[dict] = None
    latency_ms: Optional[int] = None
    finished_at: Optional[datetime] = None


class AIExecutionResponse(AIExecutionBase):
    id: UUID
    status: str
    current_node: Optional[str] = None
    payload: Optional[dict] = None
    result: Optional[dict] = None
    error: Optional[str] = None
    thread_id: Optional[str] = None
    interrupted_at: Optional[datetime] = None
    interrupted_state: Optional[dict] = None
    latency_ms: Optional[int] = None
    llm_model: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── AIAuditLog Schemas ─────────────────────────────────────────
class AIAuditLogResponse(BaseModel):
    id: UUID
    execution_id: Optional[UUID] = None
    node_name: str
    action: str
    actor: str
    details: Optional[dict] = None
    llm_model: Optional[str] = None
    latency_ms: Optional[int] = None
    token_count: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── AITicketSuggestion Schemas ─────────────────────────────────
class AITicketSuggestionCreate(BaseModel):
    ticket_id: UUID
    execution_id: Optional[UUID] = None
    suggestion_type: str
    suggestion: dict
    confidence: Optional[Decimal] = None


class AITicketSuggestionResponse(AITicketSuggestionCreate):
    id: UUID
    applied: bool
    applied_by: Optional[UUID] = None
    applied_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── AIApprovalFeedback Schemas ────────────────────────────────
class AIApprovalFeedbackCreate(BaseModel):
    ai_correct: str  # correct, partial, wrong, unnecessary
    evaluation_notes: Optional[str] = None
    suggestion_snapshot: Optional[dict] = None
    ticket_snapshot: Optional[dict] = None
    resolution_time_minutes: Optional[int] = None


class AIApprovalFeedbackResponse(AIApprovalFeedbackCreate):
    id: UUID
    approval_id: UUID
    evaluator_id: Optional[UUID] = None
    evaluated_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


# ── AIApprovalMetrics Schemas ──────────────────────────────────
class AIApprovalMetricsResponse(BaseModel):
    id: UUID
    period_start: datetime
    period_end: datetime
    granularity: str
    approval_type: str
    ticket_priority: Optional[str] = None
    ticket_category: Optional[str] = None
    total_count: int
    approved_count: int
    rejected_count: int
    expired_count: int
    auto_skipped_count: int
    avg_confidence: Optional[Decimal] = None
    avg_resolution_minutes: Optional[int] = None
    correct_count: int
    partial_count: int
    wrong_count: int
    current_threshold: Optional[Decimal] = None
    rule_enabled: bool
    updated_at: datetime

    class Config:
        from_attributes = True


# ── AIApprovalRule Schemas ─────────────────────────────────────
class AIApprovalRuleBase(BaseModel):
    name: str
    description: Optional[str] = None
    approval_type: str
    min_confidence: Decimal = Decimal("0.70")
    ticket_priority: Optional[str] = None
    ticket_category: Optional[str] = None
    intent: Optional[str] = None
    language: Optional[str] = None
    action: str = 'require_review'
    is_active: bool = True
    dry_run: bool = True  # ⚠️ always True in phase 1


class AIApprovalRuleCreate(AIApprovalRuleBase):
    pass


class AIApprovalRuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    min_confidence: Optional[Decimal] = None
    ticket_priority: Optional[str] = None
    ticket_category: Optional[str] = None
    intent: Optional[str] = None
    language: Optional[str] = None
    action: Optional[str] = None
    is_active: Optional[bool] = None
    dry_run: Optional[bool] = None  # ⚠️ warn if user tries to set FALSE
    notes: Optional[str] = None


class AIApprovalRuleResponse(AIApprovalRuleBase):
    id: UUID
    is_system: bool
    confidence_feedback_based: bool
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    last_triggered_at: Optional[datetime] = None
    notes: Optional[str] = None
    trigger_count: int

    class Config:
        from_attributes = True


# ── Stats / Dashboard ─────────────────────────────────────────
class AIStatsResponse(BaseModel):
    total_pending: int
    total_approved_today: int
    total_rejected_today: int
    total_expired_today: int
    avg_confidence: Optional[Decimal] = None
    dry_run_matches: int
    executions_running: int


# ── AI Models Config ─────────────────────────────────────────
class AIModelBase(BaseModel):
    name: str = Field(..., max_length=100)
    type: Literal["llm", "embedding"]
    provider: str = Field(..., max_length=50)
    model_id: str = Field(..., max_length=200)
    api_base: Optional[str] = Field(None, max_length=500)
    api_key_ref: Optional[str] = Field(None, max_length=100)
    temperature: Decimal = Field(default=Decimal("0.7"), ge=0, le=2)
    max_tokens: Optional[int] = None
    top_p: Optional[Decimal] = Field(None, ge=0, le=1)
    top_k: Optional[int] = None
    dimension: Optional[int] = None
    description: Optional[str] = None


class AIModelCreate(AIModelBase):
    is_default: bool = False


class AIModelUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    temperature: Optional[Decimal] = Field(None, ge=0, le=2)
    max_tokens: Optional[int] = None
    top_p: Optional[Decimal] = Field(None, ge=0, le=1)
    top_k: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None


class AIModelResponse(AIModelBase):
    id: UUID
    is_active: bool
    is_default: bool
    is_system: bool
    model_metadata: dict = {}
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── AIPromptTemplate Schemas ───────────────────────────────────────

class AIPromptTemplateBase(BaseModel):
    name: str = Field(..., max_length=200)
    type: str = Field(..., max_length=50)  # classification | suggestion | escalation | agent_system | rag_query
    prompt_template: str = ""
    variables: list[str] = []
    model_type: str = Field(default="llm", max_length=20)  # llm | embedding
    is_active: bool = True
    is_default: bool = False


class AIPromptTemplateCreate(AIPromptTemplateBase):
    customer_id: Optional[UUID] = None


class AIPromptTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    prompt_template: Optional[str] = None
    variables: Optional[list[str]] = None
    model_type: Optional[str] = Field(None, max_length=20)
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None


class AIPromptTemplateResponse(AIPromptTemplateBase):
    id: UUID
    is_system: bool
    customer_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── AITool Schemas ────────────────────────────────────────────────

class AIToolBase(BaseModel):
    name: str = Field(..., max_length=100)
    description: Optional[str] = None
    tool_type: str = Field(..., max_length=50)  # notification | ticket_update | knowledge_base | external_api | classification
    parameters: dict = {}
    code_template: Optional[str] = None
    is_active: bool = True
    is_default: bool = False


class AIToolCreate(AIToolBase):
    customer_id: Optional[UUID] = None


class AIToolUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    tool_type: Optional[str] = Field(None, max_length=50)
    parameters: Optional[dict] = None
    code_template: Optional[str] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None


class AIToolResponse(AIToolBase):
    id: UUID
    is_system: bool
    customer_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True