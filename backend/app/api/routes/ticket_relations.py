from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import TicketRelation, Ticket
from app.schemas.schemas import TicketRelationCreate, TicketRelationResponse
from app.core.security import get_current_user

router = APIRouter()


@router.get("/ticket-relations", response_model=List[TicketRelationResponse])
async def list_ticket_relations(
    ticket_id: UUID = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    query = db.query(TicketRelation)
    if ticket_id:
        query = query.filter(
            (TicketRelation.source_ticket_id == ticket_id) |
            (TicketRelation.target_ticket_id == ticket_id)
        )
    relations = query.all()
    result = []
    for r in relations:
        target = db.query(Ticket).filter(Ticket.id == r.target_ticket_id).first()
        result.append(TicketRelationResponse(
            id=r.id,
            source_ticket_id=r.source_ticket_id,
            target_ticket_id=r.target_ticket_id,
            created_at=r.created_at,
            target_ticket_title=target.title if target else None
        ))
    return result


@router.post("/ticket-relations", response_model=TicketRelationResponse)
async def create_ticket_relation(
    data: TicketRelationCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    # Check if already exists
    existing = db.query(TicketRelation).filter(
        TicketRelation.source_ticket_id == data.source_ticket_id,
        TicketRelation.target_ticket_id == data.target_ticket_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Relation already exists")
    
    # Verify both tickets exist
    t1 = db.query(Ticket).filter(Ticket.id == data.source_ticket_id).first()
    t2 = db.query(Ticket).filter(Ticket.id == data.target_ticket_id).first()
    if not t1 or not t2:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    relation = TicketRelation(**data.model_dump())
    db.add(relation)
    db.commit()
    db.refresh(relation)
    
    return TicketRelationResponse(
        id=relation.id,
        source_ticket_id=relation.source_ticket_id,
        target_ticket_id=relation.target_ticket_id,
        created_at=relation.created_at,
        target_ticket_title=t2.title
    )


@router.delete("/ticket-relations/{relation_id}")
async def delete_ticket_relation(
    relation_id: UUID,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    relation = db.query(TicketRelation).filter(TicketRelation.id == relation_id).first()
    if not relation:
        raise HTTPException(status_code=404, detail="Relation not found")
    db.delete(relation)
    db.commit()
    return {"message": "Relation removed"}
