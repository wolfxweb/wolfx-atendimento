from typing import Optional, List
from uuid import UUID
import uuid
import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Ticket, User, TicketStatus, TicketApproval, Comment
from app.schemas.schemas import TicketCreate, TicketUpdate, TicketResponse, ApprovalCreate, ApprovalResponse, CommentCreate, CommentUpdate, CommentResponse
from app.core.security import require_agent, get_current_user
from app.utils.telegram import send_ticket_resolved
from app.config import settings

router = APIRouter()


def save_file(file: UploadFile, subdir: str = "tickets") -> dict:
    """Salva ficheiro e retorna info"""
    ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, subdir, filename)
    
    # Criar dir se não existir
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    
    # Salvar ficheiro
    with open(filepath, "wb") as f:
        content = file.file.read()
        f.write(content)
    
    return {"filename": filename, "filepath": filepath, "url": f"/uploads/{subdir}/{filename}"}


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
    ticket_dict = ticket_data.model_dump()

    if current_user.role == "customer":
        # Customers must use their own customer_id
        ticket_dict["customer_id"] = current_user.customer_id
    elif current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only customers or admins can create tickets")

    # Admin must specify customer_id when creating on behalf of a customer
    if current_user.role == "admin" and not ticket_dict.get("customer_id"):
        raise HTTPException(status_code=400, detail="Admin must specify customer_id when creating a ticket")

    # Data de abertura é sempre definida automaticamente
    ticket_dict["opened_at"] = datetime.utcnow()

    ticket = Ticket(
        **ticket_dict,
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
    
    update_dict = ticket_data.model_dump(exclude_unset=True)

    # Converter datetime strings para datetime objects (evita erro de parse de strings vazias)
    for field in ("attended_at", "closed_at"):
        if field in update_dict:
            val = update_dict[field]
            if not val or val == "" or (isinstance(val, str) and len(val.strip()) < 16):
                update_dict[field] = None
            else:
                try:
                    update_dict[field] = datetime.fromisoformat(val.replace("Z", "+00:00"))
                except Exception:
                    update_dict[field] = None

    # Se status mudou para closed/solved e closed_at não foi enviado, preencher automaticamente
    if update_dict.get("status") in (TicketStatus.CLOSED.value, TicketStatus.SOLVED.value):
        if "closed_at" not in update_dict or update_dict["closed_at"] is None:
            update_dict["closed_at"] = datetime.utcnow()

    for key, value in update_dict.items():
        setattr(ticket, key, value)
    
    # Se ticket foi marcado como solved, notificar cliente por Telegram
    if ticket_data.status == TicketStatus.SOLVED.value and ticket_data.resolution_summary:
        # Buscar chat_id do customer
        customer = db.query(User).filter(
            User.customer_id == ticket.customer_id,
            User.telegram_chat_id.isnot(None)
        ).first()
        
        if customer and customer.telegram_chat_id:
            # Buscar nome do agent
            agent = db.query(User).filter(User.id == ticket.agent_id).first()
            agent_name = agent.name if agent else "Agente"
            
            send_ticket_resolved(
                chat_id=customer.telegram_chat_id,
                ticket_id=str(ticket.id),
                title=ticket.title,
                agent_name=agent_name,
                resolution_summary=ticket_data.resolution_summary or ticket.resolution_summary or ""
            )
    
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


@router.post("/tickets/bulk-delete")
async def bulk_delete_tickets(
    ticket_ids: List[UUID],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can bulk delete tickets")
    
    for ticket_id in ticket_ids:
        ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
        if ticket:
            db.delete(ticket)
    
    db.commit()
    return {"message": f"{len(ticket_ids)} tickets deleted"}


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


# Allowed file types: images + documents
ALLOWED_ATTACHMENT_TYPES = [
    # Images
    "image/jpeg", "image/png", "image/gif", "image/webp",
    # Documents
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
]
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/tickets/{ticket_id}/attachments")
async def upload_ticket_attachments(
    ticket_id: UUID,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload de múltiplos anexos para ticket.
    Suporta: jpg, jpeg, png, gif, webp, pdf, doc, docx, xls, xlsx, ppt, pptx, txt
    Máximo: 10MB por ficheiro, até 10 ficheiros por upload
    """
    # Verificar se ticket existe
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Verificar acesso (customer dono ou agent/admin)
    if current_user.role == "customer" and ticket.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Limite de ficheiros
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 files per upload")

    results = []
    errors = []

    for file in files:
        # Validar tipo de ficheiro
        if file.content_type not in ALLOWED_ATTACHMENT_TYPES:
            errors.append(f"{file.filename}: tipo '{file.content_type}' não permitido")
            continue

        # Validar tamanho
        contents = await file.read()
        if len(contents) > MAX_FILE_SIZE:
            errors.append(f"{file.filename}: ficheiro demasiado grande (max 10MB)")
            continue

        # Salvar ficheiro
        file.file.seek(0)
        result = save_file(file, subdir="tickets")
        results.append({"url": result["url"], "filename": result["filename"], "content_type": file.content_type})

    # Adicionar URLs aos anexos do ticket
    attachments = ticket.photos or []
    for r in results:
        attachments.append(r["url"])
    ticket.photos = attachments

    db.commit()

    return {"uploaded": results, "errors": errors if errors else None}


@router.delete("/tickets/{ticket_id}/photos/{filename}")
async def delete_ticket_photo(
    ticket_id: UUID,
    filename: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove foto de ticket"""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    # Verificar acesso
    if current_user.role == "customer" and ticket.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Remover da lista
    photos = ticket.photos or []
    url_to_remove = f"/uploads/tickets/{filename}"
    if url_to_remove in photos:
        photos.remove(url_to_remove)
        ticket.photos = photos
        db.commit()
        
        # Apagar ficheiro fisico
        filepath = os.path.join(settings.UPLOAD_DIR, "tickets", filename)
        if os.path.exists(filepath):
            os.remove(filepath)
        
        return {"message": "Photo deleted"}

    raise HTTPException(status_code=404, detail="Photo not found")


# =====================
# COMMENTS
# =====================

@router.get("/tickets/{ticket_id}/comments", response_model=List[dict])
async def list_comments(
    ticket_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista comentarios de um ticket"""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Verificar acesso
    if current_user.role == "customer" and ticket.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Se customer, só veem comentarios publicos
    if current_user.role == "customer":
        comments = db.query(Comment).filter(
            Comment.ticket_id == ticket_id,
            Comment.is_public == True
        ).order_by(Comment.created_at.desc()).offset(skip).limit(limit).all()
    else:
        comments = db.query(Comment).filter(
            Comment.ticket_id == ticket_id
        ).order_by(Comment.created_at.desc()).offset(skip).limit(limit).all()

    result = []
    for c in comments:
        result.append({
            "id": str(c.id),
            "ticket_id": str(c.ticket_id),
            "author_id": str(c.author_id),
            "author_name": c.author.name if c.author else None,
            "author_role": c.author.role if c.author else None,
            "body": c.body,
            "is_public": c.is_public,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })

    return result


@router.post("/tickets/{ticket_id}/comments", response_model=dict)
async def create_comment(
    ticket_id: UUID,
    comment_data: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Adiciona comentario a um ticket"""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Verificar acesso
    if current_user.role == "customer" and ticket.customer_id != current_user.customer_id:
        raise HTTPException(status_code=403, detail="Access denied")

    comment = Comment(
        ticket_id=ticket_id,
        author_id=current_user.id,
        body=comment_data.body,
        is_public=comment_data.is_public
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    return {
        "id": str(comment.id),
        "ticket_id": str(comment.ticket_id),
        "author_id": str(comment.author_id),
        "author_name": current_user.name,
        "author_role": current_user.role,
        "body": comment.body,
        "is_public": comment.is_public,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
    }


@router.patch("/tickets/{ticket_id}/comments/{comment_id}", response_model=dict)
async def update_comment(
    ticket_id: UUID,
    comment_id: UUID,
    comment_data: CommentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Actualiza comentario (só o author ou admin)"""
    comment = db.query(Comment).filter(
        Comment.id == comment_id,
        Comment.ticket_id == ticket_id
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    # Só o author ou admin pode editar
    if comment.author_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    if comment_data.body is not None:
        comment.body = comment_data.body
    if comment_data.is_public is not None:
        comment.is_public = comment_data.is_public

    db.commit()
    db.refresh(comment)

    return {
        "id": str(comment.id),
        "ticket_id": str(comment.ticket_id),
        "author_id": str(comment.author_id),
        "author_name": comment.author.name if comment.author else None,
        "author_role": comment.author.role if comment.author else None,
        "body": comment.body,
        "is_public": comment.is_public,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
    }


@router.delete("/tickets/{ticket_id}/comments/{comment_id}")
async def delete_comment(
    ticket_id: UUID,
    comment_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Apaga comentario (só o author ou admin)"""
    comment = db.query(Comment).filter(
        Comment.id == comment_id,
        Comment.ticket_id == ticket_id
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    # Só o author ou admin pode apagar
    if comment.author_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    db.delete(comment)
    db.commit()

    return {"message": "Comment deleted"}
