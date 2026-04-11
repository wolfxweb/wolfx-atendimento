from typing import Optional, List
from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Ticket, User, TicketStatus, TicketApproval
from app.schemas.schemas import TicketCreate, TicketUpdate, TicketResponse, ApprovalCreate, ApprovalResponse
from app.core.security import require_agent, get_current_user

router = APIRouter()


@router.get("/tickets", response_model=List[TicketResponse])
async def list_tickets(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    priority: Optional[str] = None,
    customer_id: Optional[UUID] = None,
    agent_id: Optional[UUID] = None,
    category_id: Optional[UUID] = None,
    sla_status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Ticket)
    
    # Customers só veem os seus próprios tickets
    if current_user.role == "customer":
        query = query.filter(Ticket.customer_id == current_user.customer_id)
    elif customer_id:
        query = query.filter(Ticket.customer_id == customer_id)
    
    if status:
        query = query.filter(Ticket.status == status)
    if priority:
        query = query.filter(Ticket.priority == priority)
    if agent_id:
        query = query.filter(Ticket.agent_id == agent_id)
    if category_id:
        query = query.filter(Ticket.category_id == category_id)
    if sla_status:
        query = query.filter(Ticket.sla_status == sla_status)
    
    tickets = query.order_by(Ticket.created_at.desc()).offset(skip).limit(limit).all()
    return tickets


@router.post("/tickets", response_model=TicketResponse)
async def create_ticket(
    ticket_data: TicketCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "customer":
        raise HTTPException(status_code=403, detail="Only customers can create tickets")
    
    ticket = Ticket(
        **ticket_data.model_dump(),
        customer_id=current_user.customer_id,
        created_by=current_user.id
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


@router.get("/tickets/{ticket_id}", response_model=TicketResponse)
async def get_ticket(
    ticket_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    # Verificar acesso
    if current_user.role == "customer" and ticket.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return ticket


@router.patch("/tickets/{ticket_id}", response_model=TicketResponse)
async def update_ticket(
    ticket_id: UUID,
    ticket_data: TicketUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    # Verificar acesso
    if current_user.role == "customer":
        raise HTTPException(status_code=403, detail="Customers cannot update tickets")
    
    # Agent só pode atualizar se for assignee
    if current_user.role == "agent" and ticket.agent_id != current_user.id:
        raise HTTPException(status_code=403, detail="Ticket assigned to another agent")
    
    for key, value in ticket_data.model_dump(exclude_unset=True).items():
        setattr(ticket, key, value)
    
    db.commit()
    db.refresh(ticket)
    return ticket


@router.delete("/tickets/{ticket_id}")
async def delete_ticket(
    ticket_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete tickets")
    
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    db.delete(ticket)
    db.commit()
    return {"message": "Ticket deleted"}


@router.post("/tickets/{ticket_id}/approve", response_model=ApprovalResponse)
async def approve_ticket(
    ticket_id: UUID,
    approval_data: ApprovalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    # Verificar se é o customer dono
    if current_user.role == "customer" and ticket.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Verificar se ticket está em solved
    if ticket.status != TicketStatus.SOLVED.value:
        raise HTTPException(status_code=400, detail="Ticket must be solved first")
    
    # Se rejeitar, comentário é obrigatório
    if approval_data.action == "rejected" and not approval_data.comment:
        raise HTTPException(status_code=400, detail="Comment required for rejection")
    
    # Criar approval
    approval = TicketApproval(
        ticket_id=ticket_id,
        user_id=current_user.id,
        action=approval_data.action,
        comment=approval_data.comment
    )
    db.add(approval)
    
    # Atualizar ticket
    if approval_data.action == "approved":
        ticket.status = TicketStatus.CLOSED.value
        ticket.approved_at = datetime.utcnow()
        ticket.approved_by = current_user.id
    else:
        ticket.status = TicketStatus.REOPENED.value
    
    db.commit()
    db.refresh(approval)
    return approval


@router.post("/tickets/{ticket_id}/reject", response_model=ApprovalResponse)
async def reject_ticket(
    ticket_id: UUID,
    approval_data: ApprovalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    approval_data.action = "rejected"
    return await approve_ticket(ticket_id, approval_data, db, current_user)
