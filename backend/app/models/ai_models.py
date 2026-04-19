"""
AI Module SQLAlchemy Models - Phase 1
All AI approval/monitoring models
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Boolean, Integer, Numeric,
    DateTime, ForeignKey, JSON
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class AIWorkflowExecution(Base):
    __tablename__ = 'ai_workflow_executions'

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id        = Column(UUID(as_uuid=True), ForeignKey('tickets.id'), nullable=False)
    workflow_name    = Column(String(100), nullable=False, default='ticket_ai_assistant')
    status           = Column(String(30), nullable=False, default='pending')
    current_node     = Column(String(50))
    payload          = Column(JSON)
    result           = Column(JSON)
    error            = Column(Text)
    thread_id        = Column(String(255))
    interrupted_at   = Column(DateTime)
    interrupted_state = Column(JSON)
    latency_ms       = Column(Integer)
    llm_model        = Column(String(50), default='google/gemini-2.0-flash-exp')
    dry_run          = Column(Boolean, default=True)
    started_at       = Column(DateTime, default=datetime.utcnow)
    finished_at      = Column(DateTime)
    created_at       = Column(DateTime, default=datetime.utcnow)

    # Relationships
    ticket = relationship("Ticket", back_populates="ai_executions")
    approvals = relationship("AIApproval", back_populates="execution")
    audit_logs = relationship("AIAuditLog", back_populates="execution")
    suggestions = relationship("AITicketSuggestion", back_populates="execution")


class AIApproval(Base):
    __tablename__ = 'ai_approvals'

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    execution_id     = Column(UUID(as_uuid=True), ForeignKey('ai_workflow_executions.id'), nullable=False)
    ticket_id        = Column(UUID(as_uuid=True), ForeignKey('tickets.id'), nullable=False)
    approval_type    = Column(String(50), nullable=False)
    step_description = Column(Text, nullable=False)
    ai_suggestion    = Column(JSON, nullable=False)

    # Monitoring fields
    confidence        = Column(Numeric(5, 4))
    ticket_priority   = Column(String(20))
    ticket_category   = Column(String(100))
    auto_skipped      = Column(Boolean, default=False)
    matched_rule_id   = Column(UUID(as_uuid=True), ForeignKey('ai_approval_rules.id'))
    dry_run           = Column(Boolean, default=True)  # ⚠️ always True in phase 1
    rule_action       = Column(String(20))

    # Decision
    human_decision    = Column(String(20))
    human_notes       = Column(Text)
    approver_user_id  = Column(UUID(as_uuid=True), ForeignKey('users.id'))
    approved_at       = Column(DateTime)
    created_at        = Column(DateTime, default=datetime.utcnow)
    expires_at        = Column(DateTime)
    resume_checkpoint = Column(JSON)

    # Relationships
    execution = relationship("AIWorkflowExecution", back_populates="approvals")
    ticket    = relationship("Ticket", back_populates="ai_approvals")
    approver  = relationship("User")
    feedback  = relationship("AIApprovalFeedback", back_populates="approval", uselist=False)
    matched_rule = relationship("AIApprovalRule", foreign_keys=[matched_rule_id])


class AIAuditLog(Base):
    __tablename__ = 'ai_audit_log'

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    execution_id = Column(UUID(as_uuid=True), ForeignKey('ai_workflow_executions.id'))
    node_name    = Column(String(50), nullable=False)
    action       = Column(String(100), nullable=False)
    actor        = Column(String(20), nullable=False)  # ai, human, system
    details      = Column(JSON)
    llm_model    = Column(String(50))
    latency_ms   = Column(Integer)
    token_count  = Column(Integer)
    created_at   = Column(DateTime, default=datetime.utcnow)

    execution = relationship("AIWorkflowExecution", back_populates="audit_logs")


class AITicketSuggestion(Base):
    __tablename__ = 'ai_ticket_suggestions'

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id       = Column(UUID(as_uuid=True), ForeignKey('tickets.id'), nullable=False)
    execution_id    = Column(UUID(as_uuid=True), ForeignKey('ai_workflow_executions.id'))
    suggestion_type = Column(String(50), nullable=False)
    suggestion      = Column(JSON, nullable=False)
    confidence      = Column(Numeric(5, 4))
    applied         = Column(Boolean, default=False)
    applied_by      = Column(UUID(as_uuid=True), ForeignKey('users.id'))
    applied_at      = Column(DateTime)
    created_at      = Column(DateTime, default=datetime.utcnow)

    ticket    = relationship("Ticket", back_populates="ai_suggestions")
    execution = relationship("AIWorkflowExecution", back_populates="suggestions")


class AIApprovalFeedback(Base):
    __tablename__ = 'ai_approval_feedback'

    id                     = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    approval_id            = Column(UUID(as_uuid=True), ForeignKey('ai_approvals.id'), nullable=False, unique=True)
    ai_correct             = Column(String(20), nullable=False)
    evaluator_id           = Column(UUID(as_uuid=True), ForeignKey('users.id'))
    evaluation_notes       = Column(Text)
    evaluated_at           = Column(DateTime, default=datetime.utcnow)
    suggestion_snapshot    = Column(JSON)
    ticket_snapshot        = Column(JSON)
    resolution_time_minutes = Column(Integer)
    created_at              = Column(DateTime, default=datetime.utcnow)

    approval  = relationship("AIApproval", back_populates="feedback")
    evaluator = relationship("User")


class AIApprovalMetrics(Base):
    __tablename__ = 'ai_approval_metrics'

    id                     = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    period_start           = Column(DateTime, nullable=False)
    period_end             = Column(DateTime, nullable=False)
    granularity            = Column(String(10), nullable=False)
    approval_type          = Column(String(50), nullable=False)
    ticket_priority        = Column(String(20))
    ticket_category        = Column(String(100))
    total_count            = Column(Integer, default=0)
    approved_count         = Column(Integer, default=0)
    rejected_count         = Column(Integer, default=0)
    expired_count          = Column(Integer, default=0)
    auto_skipped_count     = Column(Integer, default=0)
    avg_confidence         = Column(Numeric(5, 4))
    avg_resolution_minutes = Column(Integer)
    correct_count          = Column(Integer, default=0)
    partial_count          = Column(Integer, default=0)
    wrong_count            = Column(Integer, default=0)
    current_threshold      = Column(Numeric(5, 4))
    rule_enabled           = Column(Boolean, default=False)
    updated_at             = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AIApprovalRule(Base):
    __tablename__ = 'ai_approval_rules'

    id                        = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name                      = Column(String(100), nullable=False)
    description               = Column(Text)
    approval_type             = Column(String(50), nullable=False)
    min_confidence            = Column(Numeric(5, 4), default=0.70)
    ticket_priority           = Column(String(20))
    ticket_category           = Column(String(100))
    intent                    = Column(String(50))
    language                  = Column(String(10))
    action                    = Column(String(20), nullable=False, default='require_review')
    is_active                 = Column(Boolean, default=True)
    is_system                 = Column(Boolean, default=False)
    dry_run                   = Column(Boolean, default=True)  # ⚠️ always True in phase 1
    confidence_feedback_based = Column(Boolean, default=False)
    created_by                = Column(UUID(as_uuid=True), ForeignKey('users.id'))
    created_at                = Column(DateTime, default=datetime.utcnow)
    updated_at                = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_triggered_at         = Column(DateTime)
    notes                     = Column(Text)
    trigger_count             = Column(Integer, default=0)

    creator = relationship("User")


class AIModel(Base):
    """Configuração de modelos LLM e Embedding — permite ao utilizador selecionar qual usar."""
    __tablename__ = "ai_models"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    type = Column(String(20), nullable=False)  # 'llm' | 'embedding'
    provider = Column(String(50), nullable=False)  # 'openrouter' | 'openai' | 'anthropic'
    model_id = Column(String(200), nullable=False)  # 'google/gemini-2.0-flash-exp'
    api_base = Column(String(500), nullable=True)
    api_key_ref = Column(String(100), nullable=True)  # env var name that holds the key
    temperature = Column(Numeric(3, 2), default=0.7)
    max_tokens = Column(Integer, nullable=True)
    top_p = Column(Numeric(3, 2), nullable=True)
    top_k = Column(Integer, nullable=True)
    dimension = Column(Integer, nullable=True)  # para embeddings
    is_active = Column(Boolean, default=False)
    is_default = Column(Boolean, default=False)
    is_system = Column(Boolean, default=False)  # criado pelo sistema — não pode apagar
    description = Column(Text, nullable=True)
    model_metadata = Column(JSON, default={})  # renamed: 'metadata' is reserved in SQLAlchemy
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AIPromptTemplate(Base):
    """Templates de prompts AI — permitem configuração por cliente e tipo de operação."""
    __tablename__ = "ai_prompt_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    type = Column(String(50), nullable=False)  # classification | suggestion | escalation | agent_system | rag_query
    prompt_template = Column(Text, nullable=False)
    variables = Column(JSON, default=[])  # ['title', 'description', 'category']
    model_type = Column(String(20), nullable=False, default='llm')  # llm | embedding
    is_active = Column(Boolean, default=True)
    is_default = Column(Boolean, default=False)
    is_system = Column(Boolean, default=False)  # criado pelo sistema — não pode apagar
    customer_id = Column(UUID(as_uuid=True), ForeignKey('customers.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    customer = relationship("Customer")


class AITool(Base):
    """Ferramentas que o agente AI pode usar — notify_agent, update_ticket_field, etc."""
    __tablename__ = "ai_tools"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    tool_type = Column(String(50), nullable=False)
    parameters = Column(JSON, default={})
    code_template = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    is_default = Column(Boolean, default=False)
    is_system = Column(Boolean, default=False)
    customer_id = Column(UUID(as_uuid=True), ForeignKey('customers.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    customer = relationship("Customer")


class AITicketClassification(Base):
    """Resultados de classificação de tickets pelo agente AI."""
    __tablename__ = "ai_ticket_classifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id = Column(UUID(as_uuid=True), ForeignKey("tickets.id"), nullable=False)
    execution_id = Column(UUID(as_uuid=True), ForeignKey("ai_workflow_executions.id"), nullable=True)

    category = Column(String(100), nullable=True)
    priority = Column(String(20), nullable=True)
    sentiment = Column(String(30), nullable=True)
    intent = Column(String(100), nullable=True)
    confidence = Column(Numeric(5, 4), nullable=True)
    language = Column(String(10), nullable=True)

    classified_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    ticket = relationship("Ticket")
    execution = relationship("AIWorkflowExecution")


class AITicketEscalation(Base):
    """Resultados de decisão de escalação de tickets."""
    __tablename__ = "ai_ticket_escalations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id = Column(UUID(as_uuid=True), ForeignKey("tickets.id"), nullable=False)
    execution_id = Column(UUID(as_uuid=True), ForeignKey("ai_workflow_executions.id"), nullable=True)

    should_escalate = Column(Boolean, nullable=True)
    escalation_reason = Column(Text, nullable=True)
    confidence = Column(Numeric(5, 4), nullable=True)
    priority = Column(String(20), nullable=True)

    decided_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    ticket = relationship("Ticket")
    execution = relationship("AIWorkflowExecution")