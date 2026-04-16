"""
AI Suggestions API Routes - Phase 1
Manage AI ticket suggestions (classification, response, KB, escalation, SLA)
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.database import get_db
from app.models.ai_models import AITicketSuggestion
from app.schemas.ai_schemas import AITicketSuggestionCreate, AITicketSuggestionResponse
from app.api.routes.auth import get_current_user
from app.models.models import User
from sqlalchemy import desc

router = APIRouter(prefix="/api/v1/ai/suggestions", tags=["AI Suggestions"])


@router.get("/ticket/{ticket_id}", response_model=list[AITicketSuggestionResponse])
def get_ticket_suggestions(ticket_id: UUID, db: Session = Depends(get_db)):
    return db.query(AITicketSuggestion).filter(
        AITicketSuggestion.ticket_id == ticket_id
    ).order_by(desc(AITicketSuggestion.confidence)).all()


@router.post("", response_model=AITicketSuggestionResponse)
def create_suggestion(
    suggestion: AITicketSuggestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    db_sug = AITicketSuggestion(**suggestion.model_dump())
    db.add(db_sug)
    db.commit()
    db.refresh(db_sug)
    return db_sug


@router.post("/{suggestion_id}/apply")
def apply_suggestion(
    suggestion_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    suggestion = db.query(AITicketSuggestion).filter(
        AITicketSuggestion.id == suggestion_id
    ).first()
    if not suggestion:
        raise HTTPException(404, "Suggestion not found")
    suggestion.applied = True
    suggestion.applied_by = current_user.id
    suggestion.applied_at = datetime.utcnow()
    db.commit()
    return {"status": "applied", "suggestion_id": str(suggestion_id)}


@router.post("/{suggestion_id}/reject")
def reject_suggestion(
    suggestion_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    suggestion = db.query(AITicketSuggestion).filter(
        AITicketSuggestion.id == suggestion_id
    ).first()
    if not suggestion:
        raise HTTPException(404, "Suggestion not found")
    suggestion.applied = False
    suggestion.applied_by = current_user.id
    suggestion.applied_at = datetime.utcnow()
    db.commit()
    return {"status": "rejected", "suggestion_id": str(suggestion_id)}