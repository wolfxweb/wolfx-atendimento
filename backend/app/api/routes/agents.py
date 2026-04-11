from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import User, Agent, AgentStatus
from app.schemas.schemas import AgentCreate, AgentUpdate, AgentResponse, UserResponse
from app.core.security import require_admin, require_agent, get_current_user
from app.utils.telegram import send_message as send_telegram_message

router = APIRouter()


@router.get("/agents", response_model=List[dict])
async def list_agents(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    team: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent)
):
    """
    Lista todos os agentes com os dados do User.
    Filtros: team, status
    """
    query = db.query(User).filter(User.role == "agent")
    
    if team:
        # Join com Agent para filtrar por team
        query = query.join(Agent).filter(Agent.team == team)
    if status:
        query = query.join(Agent).filter(Agent.status == status)
    
    users = query.offset(skip).limit(limit).all()
    
    # Combinar com dados do Agent
    result = []
    for user in users:
        agent = db.query(Agent).filter(Agent.user_id == user.id).first()
        agent_data = {
            "id": str(user.id),
            "customer_id": str(user.customer_id) if user.customer_id else None,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "phone": user.phone,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "team": agent.team if agent else None,
            "status": agent.status if agent else "offline",
            "max_tickets": agent.max_tickets if agent else 10,
        }
        result.append(agent_data)
    
    return result


@router.post("/agents", response_model=AgentResponse)
async def create_agent(
    agent_data: AgentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Cria perfil de agente para um user existente (admin only)"""
    
    # Verificar se user existe e é agent
    user = db.query(User).filter(User.id == agent_data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.role != "agent":
        raise HTTPException(status_code=400, detail="User must have role=agent")
    
    # Verificar se já tem perfil agent
    existing = db.query(Agent).filter(Agent.user_id == agent_data.user_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Agent profile already exists")
    
    # Validar status
    if agent_data.status not in [s.value for s in AgentStatus]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    agent = Agent(
        user_id=agent_data.user_id,
        team=agent_data.team,
        status=agent_data.status,
        max_tickets=agent_data.max_tickets
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    
    return agent


@router.get("/agents/{user_id}", response_model=dict)
async def get_agent(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent)
):
    """Ver detalhes de um agente"""
    user = db.query(User).filter(User.id == user_id, User.role == "agent").first()
    if not user:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    agent = db.query(Agent).filter(Agent.user_id == user_id).first()
    
    return {
        "user_id": str(user.id),
        "email": user.email,
        "name": user.name,
        "phone": user.phone,
        "role": user.role,
        "is_active": user.is_active,
        "team": agent.team if agent else None,
        "status": agent.status if agent else "offline",
        "max_tickets": agent.max_tickets if agent else 10,
    }


@router.patch("/agents/{user_id}", response_model=AgentResponse)
async def update_agent(
    user_id: UUID,
    agent_data: AgentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Actualiza perfil de agente (admin only)"""
    
    # Verificar se é agent
    user = db.query(User).filter(User.id == user_id, User.role == "agent").first()
    if not user:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    agent = db.query(Agent).filter(Agent.user_id == user_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent profile not found")
    
    # Actualizar campos
    if agent_data.team is not None:
        agent.team = agent_data.team
    if agent_data.status is not None:
        if agent_data.status not in [s.value for s in AgentStatus]:
            raise HTTPException(status_code=400, detail="Invalid status")
        agent.status = agent_data.status
    if agent_data.max_tickets is not None:
        agent.max_tickets = agent_data.max_tickets
    
    db.commit()
    db.refresh(agent)
    
    return agent


@router.patch("/agents/{user_id}/status")
async def update_agent_status(
    user_id: UUID,
    status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent)
):
    """Agent pode actualizar o próprio status (available, away, offline)"""
    
    # Só o próprio agent ou admin pode mudar
    if str(current_user.id) != str(user_id) and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Verificar se é agent
    user = db.query(User).filter(User.id == user_id, User.role == "agent").first()
    if not user:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Validar status
    if status not in [s.value for s in AgentStatus]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    agent = db.query(Agent).filter(Agent.user_id == user_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent profile not found")
    
    agent.status = status
    db.commit()
    
    return {"message": "Status updated", "status": status}


@router.delete("/agents/{user_id}")
async def delete_agent(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Remove perfil de agente (admin only)"""
    
    agent = db.query(Agent).filter(Agent.user_id == user_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    db.delete(agent)
    db.commit()
    
    return {"message": "Agent profile removed"}
