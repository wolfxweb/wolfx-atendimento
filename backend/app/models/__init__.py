# AI Models
from app.models.ai_models import (
    AIWorkflowExecution,
    AIApproval,
    AIAuditLog,
    AITicketSuggestion,
    AIApprovalFeedback,
    AIApprovalMetrics,
    AIApprovalRule,
    AIModel,
    AIPromptTemplate,
    AITool,
    AITicketClassification,
    AITicketEscalation,
)

# Resolve Ticket relationship for SQLAlchemy mapper
# (Ticket is defined in models.py and used in ai_models relationships)
from app.models.models import Ticket, User  # noqa: F401