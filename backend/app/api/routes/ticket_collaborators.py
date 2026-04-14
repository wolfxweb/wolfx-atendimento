from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.models import TicketCollaborator, Ticket, User
from app.schemas.schemas import TicketCollaboratorCreate, TicketCollaboratorUpdate, TicketCollaboratorResponse
from app.core.security import get_current_user

router = APIRouter()


@router.get("/ticket-collaborators", response_model=List[TicketCollaboratorResponse])
async def list_ticket_collaborators(
    ticket_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(TicketCollaborator)
    if ticket_id:
        query = query.filter(TicketCollaborator.ticket_id == ticket_id)
    collaborators = query.all()
    result = []
    for c in collaborators:
        user = db.query(User).filter(User.id == c.user_id).first()
        result.append(TicketCollaboratorResponse(
            id=c.id,
            ticket_id=c.ticket_id,
            user_id=c.user_id,
            hours_spent=c.hours_spent,
            minutes_spent=c.minutes_spent,
            notes=c.notes,
            created_at=c.created_at,
            updated_at=c.updated_at,
            user_name=user.name if user else None
        ))
    return result


@router.post("/ticket-collaborators", response_model=TicketCollaboratorResponse)
async def create_ticket_collaborator(
    data: TicketCollaboratorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify ticket exists
    ticket = db.query(Ticket).filter(Ticket.id == data.ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    collaborator = TicketCollaborator(**data.model_dump())
    db.add(collaborator)
    db.commit()
    db.refresh(collaborator)
    
    user = db.query(User).filter(User.id == collaborator.user_id).first()
    return TicketCollaboratorResponse(
        id=collaborator.id,
        ticket_id=collaborator.ticket_id,
        user_id=collaborator.user_id,
        hours_spent=collaborator.hours_spent,
        minutes_spent=collaborator.minutes_spent,
        notes=collaborator.notes,
        created_at=collaborator.created_at,
        updated_at=collaborator.updated_at,
        user_name=user.name if user else None
    )


@router.patch("/ticket-collaborators/{collaborator_id}", response_model=TicketCollaboratorResponse)
async def update_ticket_collaborator(
    collaborator_id: UUID,
    data: TicketCollaboratorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    collaborator = db.query(TicketCollaborator).filter(TicketCollaborator.id == collaborator_id).first()
    if not collaborator:
        raise HTTPException(status_code=404, detail="Collaborator not found")
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(collaborator, key, value)
    
    db.commit()
    db.refresh(collaborator)
    
    user = db.query(User).filter(User.id == collaborator.user_id).first()
    return TicketCollaboratorResponse(
        id=collaborator.id,
        ticket_id=collaborator.ticket_id,
        user_id=collaborator.user_id,
        hours_spent=collaborator.hours_spent,
        minutes_spent=collaborator.minutes_spent,
        notes=collaborator.notes,
        created_at=collaborator.created_at,
        updated_at=collaborator.updated_at,
        user_name=user.name if user else None
    )


@router.delete("/ticket-collaborators/{collaborator_id}")
async def delete_ticket_collaborator(
    collaborator_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    collaborator = db.query(TicketCollaborator).filter(TicketCollaborator.id == collaborator_id).first()
    if not collaborator:
        raise HTTPException(status_code=404, detail="Collaborator not found")
    
    db.delete(collaborator)
    db.commit()
    return {"message": "Collaborator removed from ticket"}
