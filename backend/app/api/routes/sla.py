from typing import Optional, List
from uuid import UUID
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import SLA, User, Ticket, Category
from app.schemas.schemas import SLACreate, SLAUpdate, SLAResponse
from app.core.security import require_admin, require_agent, get_current_user

router = APIRouter()


def _find_sla_for_ticket(db: Session, customer_id: UUID, priority: str, category_id: Optional[UUID]) -> Optional[SLA]:
    """Find the best matching SLA for a ticket based on customer + priority + category."""
    # Try exact match: customer + priority + category
    sla = db.query(SLA).filter(
        SLA.customer_id == customer_id,
        SLA.priority == priority,
        SLA.category_id == category_id,
        SLA.is_active == True,
    ).first()

    if not sla and category_id:
        # Try customer + priority without category (generic SLA for this priority)
        sla = db.query(SLA).filter(
            SLA.customer_id == customer_id,
            SLA.priority == priority,
            SLA.category_id == None,
            SLA.is_active == True,
        ).first()

    if not sla:
        # Try global (customer_id=NULL) + priority + category
        sla = db.query(SLA).filter(
            SLA.customer_id == None,
            SLA.priority == priority,
            SLA.category_id == category_id,
            SLA.is_active == True,
        ).first()

    if not sla:
        # Try global + priority (no category)
        sla = db.query(SLA).filter(
            SLA.customer_id == None,
            SLA.priority == priority,
            SLA.category_id == None,
            SLA.is_active == True,
        ).first()

    return sla


# IMPORTANT: Static routes must come before {sla_id} routes
# otherwise FastAPI matches "global" as a UUID

@router.get("/sla", response_model=List[SLAResponse])
async def list_slas(
    customer_id: Optional[UUID] = Query(None),
    priority: Optional[str] = Query(None),
    category_id: Optional[UUID] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    """Lista SLAs com filtros opcionais. Customers veem só os seus + global."""
    q = db.query(SLA)

    if current_user.role == "customer":
        q = q.filter((SLA.customer_id == current_user.customer_id) | (SLA.customer_id == None))

    if customer_id is not None:
        q = q.filter(SLA.customer_id == customer_id)
    if priority:
        q = q.filter(SLA.priority == priority)
    if category_id is not None:
        q = q.filter(SLA.category_id == category_id)
    if is_active is not None:
        q = q.filter(SLA.is_active == is_active)

    return q.order_by(SLA.customer_id, SLA.priority, SLA.category_id).all()


@router.post("/sla", response_model=SLAResponse, status_code=201)
async def create_sla(
    sla_data: SLACreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Cria SLA (admin only). Pode ser global ou por cliente+categoria."""
    # Check for duplicate: same customer + priority + category
    existing = db.query(SLA).filter(
        SLA.customer_id == sla_data.customer_id,
        SLA.priority == sla_data.priority,
        SLA.category_id == sla_data.category_id,
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"SLA já existe para esta combinação: customer={sla_data.customer_id}, priority={sla_data.priority}, category={sla_data.category_id}"
        )

    sla_dict = sla_data.model_dump()
    sla_dict["is_default"] = False  # Novos SLAs não são default
    sla = SLA(**sla_dict)
    db.add(sla)
    db.commit()
    db.refresh(sla)
    return sla


@router.get("/sla/global", response_model=List[SLAResponse])
async def get_global_slas(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    """Ver SLAs globais (customer_id=NULL)."""
    return db.query(SLA).filter(SLA.customer_id == None).all()


@router.patch("/sla/global", response_model=List[SLAResponse])
async def update_global_slas(
    sla_data: SLAUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Actualiza todos os SLAs globais (admin only)."""
    slas = db.query(SLA).filter(SLA.customer_id == None).all()
    for sla in slas:
        for key, value in sla_data.model_dump(exclude_unset=True).items():
            setattr(sla, key, value)
    db.commit()
    return db.query(SLA).filter(SLA.customer_id == None).all()


@router.get("/sla/dashboard", response_model=dict)
async def sla_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    """Dashboard de compliance SLA."""
    tickets = db.query(Ticket).all()
    now = datetime.utcnow()
    within = at_risk = breached = 0

    for t in tickets:
        if t.status == "closed":
            continue
        if t.sla_status == "breached":
            breached += 1
        elif t.sla_response_limit and now > t.sla_response_limit:
            breached += 1
        elif t.sla_response_limit and (t.sla_response_limit - now).total_seconds() < 900:
            at_risk += 1
        else:
            within += 1

    return {
        "total": len(tickets),
        "within_sla": within,
        "at_risk": at_risk,
        "breached": breached,
    }


@router.get("/sla/tickets/at-risk", response_model=List[dict])
async def get_at_risk_tickets(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    """Lista tickets em risco de breach SLA."""
    now = datetime.utcnow()
    tickets = db.query(Ticket).filter(Ticket.status != "closed").all()
    result = []
    for t in tickets:
        if t.sla_status in ("at_risk", "breached"):
            result.append({"id": str(t.id), "title": t.title, "priority": t.priority, "status": t.status})
        elif t.sla_response_limit and (t.sla_response_limit - now).total_seconds() < 900:
            result.append({"id": str(t.id), "title": t.title, "priority": t.priority, "status": t.status})
    return result


@router.post("/sla/calculate", response_model=dict)
async def calculate_sla(
    customer_id: UUID,
    priority: str,
    category_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    """Calcula prazos SLA para uma combinação customer+priority+category (sem criar ticket)."""
    sla = _find_sla_for_ticket(db, customer_id, priority, category_id)
    if not sla:
        raise HTTPException(status_code=404, detail="Nenhum SLA encontrado para esta combinação")
    now = datetime.utcnow()
    return {
        "sla_id": str(sla.id),
        "sla_name": sla.name,
        "priority": sla.priority,
        "category_id": str(category_id) if category_id else None,
        "response_minutes": sla.first_response_minutes,
        "resolution_minutes": sla.resolution_minutes,
        "response_limit": (now + timedelta(minutes=sla.first_response_minutes)).isoformat(),
        "resolution_limit": (now + timedelta(minutes=sla.resolution_minutes)).isoformat(),
    }


# Dynamic routes must come LAST
@router.get("/sla/{sla_id}", response_model=SLAResponse)
async def get_sla(
    sla_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
):
    sla = db.query(SLA).filter(SLA.id == sla_id).first()
    if not sla:
        raise HTTPException(status_code=404, detail="SLA not found")

    if current_user.role != "admin":
        if sla.customer_id and sla.customer_id != current_user.customer_id:
            raise HTTPException(status_code=403, detail="Access denied")
        if sla.customer_id is None:
            raise HTTPException(status_code=403, detail="Cannot edit global SLA")

    # Check duplicate if changing category or priority
    updates = sla_data.model_dump(exclude_unset=True)
    new_cat = updates.get("category_id", sla.category_id)
    new_priority = updates.get("priority", sla.priority)

    duplicate = db.query(SLA).filter(
        SLA.id != sla_id,
        SLA.customer_id == sla.customer_id,
        SLA.priority == new_priority,
        SLA.category_id == new_cat,
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="Já existe SLA para esta combinação")

    for key, value in updates.items():
        setattr(sla, key, value)
    db.commit()
    db.refresh(sla)
    return sla


@router.delete("/sla/{sla_id}")
async def delete_sla(
    sla_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    sla = db.query(SLA).filter(SLA.id == sla_id).first()
    if not sla:
        raise HTTPException(status_code=404, detail="SLA not found")

    if sla.customer_id is None:
        raise HTTPException(status_code=400, detail="Não é possível eliminar SLA global")

    db.delete(sla)
    db.commit()
    return {"message": "SLA eliminado"}
