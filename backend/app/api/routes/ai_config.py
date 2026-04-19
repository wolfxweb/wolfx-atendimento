"""
AI Config API Routes - Global agent configuration.
Stores runtime config in memory (not persisted to DB).
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.api.routes.auth import get_current_user
from app.models.models import User

router = APIRouter(prefix="/ai/config", tags=["AI Config"])


class AIConfigResponse(BaseModel):
    dry_run: bool = True
    workflow_enabled: bool = False
    auto_reply_enabled: bool = False
    agent_system_prompt_template_id: str | None = None


class AIConfigUpdate(BaseModel):
    dry_run: bool | None = None
    workflow_enabled: bool | None = None
    auto_reply_enabled: bool | None = None
    agent_system_prompt_template_id: str | None = None


# In-memory config store (overrides env defaults)
_runtime_config: dict = {
    "dry_run": True,
    "workflow_enabled": False,
    "auto_reply_enabled": False,
    "agent_system_prompt_template_id": None,
}


@router.get("", response_model=AIConfigResponse)
def get_config():
    """Retorna a configuração actual do agente AI."""
    return AIConfigResponse(**_runtime_config)


@router.patch("")
def update_config(
    data: AIConfigUpdate,
    current_user: User = Depends(get_current_user)
):
    """Actualiza a configuração do agente AI. Requer autenticação."""
    for key, value in data.model_dump(exclude_unset=True).items():
        _runtime_config[key] = value
    return {"status": "ok", "config": _runtime_config}
