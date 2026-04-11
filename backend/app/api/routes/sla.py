from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import SLA, User
from app.schemas.schemas import SLACreate, SLAUpdate, SLAResponse
from app.core.security import require_admin, require_agent, get_current_user

router = APIRouter()


@router.get("/sla", response_model=List[SLAResponse])
async def list_slas(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent)
):
    # Se customer, ver só o seu SLA custom + global
    if current_user.role == "customer":
        slas = db.query(SLA).filter(
            (SLA.customer_id == current_user.customer_id) |
            (SLA.is_default == True)
        ).all()
    else:
        slas = db.query(SLA).all()
    
    return slas


@router.post("/sla", response_model=SLAResponse)
async def create_sla(
    sla_data: SLACreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    # Verificar se customer_id é do próprio ou é admin
    if sla_data.customer_id and current_user.role != "admin":
        if sla_data.customer_id != current_user.customer_id:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Verificar se já existe SLA para esse customer+priority
    existing = db.query(SLA).filter(
        SLA.customer_id == sla_data.customer_id,
        SLA.priority == sla_data.priority
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="SLA already exists for this customer and priority")
    
    sla = SLA(**sla_data.model_dump(), is_active=True, is_default=False)
    db.add(sla)
    db.commit()
    db.refresh(sla)
    return sla


@router.get("/sla/{sla_id}", response_model=SLAResponse)
async def get_sla(
    sla_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    sla = db.query(SLA).filter(SLA.id == sla_id).first()
    if not sla:
        raise HTTPException(status_code=404, detail="SLA not found")
    return sla


@router.patch("/sla/{sla_id}", response_model=SLAResponse)
async def update_sla(
    sla_id: UUID,
    sla_data: SLAUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    sla = db.query(SLA).filter(SLA.id == sla_id).first()
    if not sla:
        raise HTTPException(status_code=404, detail="SLA not found")
    
    # Admin pode editar qualquer, customer só o seu
    if current_user.role != "admin":
        if sla.customer_id and sla.customer_id != current_user.customer_id:
            raise HTTPException(status_code=403, detail="Access denied")
        # Customer não pode editar SLA global
        if sla.is_default:
            raise HTTPException(status_code=403, detail="Cannot edit global SLA")
    
    for key, value in sla_data.model_dump(exclude_unset=True).items():
        setattr(sla, key, value)
    
    db.commit()
    db.refresh(sla)
    return sla


@router.delete("/sla/{sla_id}")
async def delete_sla(
    sla_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    sla = db.query(SLA).filter(SLA.id == sla_id).first()
    if not sla:
        raise HTTPException(status_code=404, detail="SLA not found")
    
    if sla.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete global SLA")
    
    db.delete(sla)
    db.commit()
    return {"message": "SLA deleted"}


@router.get("/sla/global", response_model=List[SLAResponse])
async def get_global_slas(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent)
):
    slas = db.query(SLA).filter(SLA.is_default == True).all()
    return slas


@router.patch("/sla/global", response_model=List[SLAResponse])
async def update_global_slas(
    sla_data: SLAUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    slas = db.query(SLA).filter(SLA.is_default == True).all()
    
    for sla in slas:
        for key, value in sla_data.model_dump(exclude_unset=True).items():
            setattr(sla, key, value)
    
    db.commit()
    return slas


@router.get("/sla/dashboard", response_model=dict)
async def sla_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent)
):
    tickets = db.query(Ticket).all()
    
    summary = {
        "total": len(tickets),
        "within_sla": len([t for t in tickets if t.sla_status == "within"]),
        "at_risk": len([t for t in tickets if t.sla_status == "at_risk"]),
        "breached": len([t for t in tickets if t.sla_status == "breached"]),
    }
    
    return summary


@router.get("/sla/tickets/at-risk", response_model=List)
async def get_at_risk_tickets(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent)
):
    tickets = db.query(Ticket).filter(Ticket.sla_status == "at_risk").all()
    return tickets
