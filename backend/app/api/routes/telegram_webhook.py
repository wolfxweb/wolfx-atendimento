"""
Webhook handler para Telegram Bot
Processa callbacks de aprovação/rejeição de tickets
"""
from datetime import datetime
from fastapi import APIRouter, Request, HTTPException, Depends
from sqlalchemy.orm import Session
import logging

from app.database import get_db
from app.models.models import Ticket, User, TicketStatus
from app.schemas.schemas import ApprovalCreate
from app.utils.telegram import (
    send_message,
    answer_callback,
    send_ticket_reopened
)
from app.core.security import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/webhook/telegram")
async def telegram_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Recebe updates do Telegram Bot via webhook
    Processa callbacks de aprovação/rejeição
    """
    body = await request.json()
    
    # Processar callback query
    if "callback_query" in body:
        return await handle_callback(body["callback_query"], db)
    
    return {"ok": True}


async def handle_callback(callback: dict, db: Session):
    """Processa callback query do Telegram"""
    callback_query_id = callback["id"]
    chat_id = callback["message"]["chat"]["id"]
    data = callback.get("data", "")
    
    # Extrair ação e ticket_id do callback_data
    # Formato: "approve:{ticket_id}" ou "reject:{ticket_id}"
    parts = data.split(":", 1)
    if len(parts) != 2:
        await answer_callback(callback_query_id, "Erro: dados inválidos")
        return {"ok": False}
    
    action, ticket_id = parts
    
    # Buscar ticket
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        await answer_callback(callback_query_id, "Ticket não encontrado")
        return {"ok": False}
    
    # Buscar user pelo telegram_chat_id
    user = db.query(User).filter(User.telegram_chat_id == str(chat_id)).first()
    if not user:
        # Tentar usar o customer do ticket
        customer_users = db.query(User).filter(
            User.customer_id == ticket.customer_id,
            User.telegram_chat_id.isnot(None)
        ).all()
        if customer_users:
            user = customer_users[0]
        else:
            await answer_callback(
                callback_query_id,
                "Utilizador não vinculado ao Telegram. Faça login na app."
            )
            return {"ok": False}
    
    # Verificar se ticket está em solved
    if ticket.status != TicketStatus.SOLVED.value:
        await answer_callback(callback_query_id, "Ticket não está pendente de aprovação")
        return {"ok": False}
    
    if action == "approve":
        # Aprovar ticket
        approval_data = ApprovalCreate(action="approved")
        
        # Atualizar ticket
        ticket.status = TicketStatus.CLOSED.value
        ticket.approved_at = datetime.utcnow()
        ticket.approved_by = user.id
        
        db.commit()
        
        await answer_callback(
            callback_query_id,
            f"✅ Ticket #{ticket_id} aprovado! Obrigado pelo feedback."
        )
        
        # Editar mensagem original para mostrar que foi aprovado
        # (opcional - por agora só respondemos)
        
        return {"ok": True, "action": "approved"}
    
    elif action == "reject":
        # Para rejeitar, precisamos do comentário
        # Enviamos mensagem a pedir comentário
        await answer_callback(
            callback_query_id,
            "Por favor, envie um comentário explicando o motivo da rejeição."
        )
        
        # Guardar estado temporário (idealmente usar Redis ou similar)
        # Por agora, vamos processar o próximo passo manualmente
        # O usuário vai enviar uma mensagem e o bot processa
        
        return {"ok": True, "action": "awaiting_comment", "ticket_id": ticket_id}
    
    return {"ok": False}


# Handler para mensagens de texto (para rejeição com comentário)
@router.post("/webhook/telegram/message")
async def telegram_message(request: Request, db: Session = Depends(get_db)):
    """
    Recebe mensagens de texto do Telegram
    Usado para processar justificações de rejeição
    """
    body = await request.json()
    
    if "message" not in body:
        return {"ok": True}
    
    message = body["message"]
    chat_id = str(message["chat"]["id"])
    text = message.get("text", "")
    
    # Buscar user
    user = db.query(User).filter(User.telegram_chat_id == chat_id).first()
    if not user:
        send_message(chat_id, "Utilizador não encontrado. Faça login na app.")
        return {"ok": True}
    
    # Verificar se há ticket pendente de comentário
    # (Implementação simplificada - em produção usar Redis)
    pending_tickets = db.query(Ticket).filter(
        Ticket.status == "pending_rejection",
        Ticket.customer_id == user.customer_id
    ).all()
    
    if pending_tickets:
        ticket = pending_tickets[0]
        ticket.status = TicketStatus.REOPENED.value
        
        # Criar approval com rejeição
        from app.models.models import TicketApproval
        approval = TicketApproval(
            ticket_id=ticket.id,
            user_id=user.id,
            action="rejected",
            comment=text
        )
        db.add(approval)
        db.commit()
        
        # Notificar agentes
        agents = db.query(User).filter(User.role == "agent").all()
        agent_chat_ids = [a.telegram_chat_id for a in agents if a.telegram_chat_id]
        if agent_chat_ids:
            send_ticket_reopened(
                agent_chat_ids,
                str(ticket.id),
                ticket.title,
                user.name,
                text
            )
        
        send_message(
            chat_id,
            f"❌ Ticket #{ticket.id} reaberto. O agente será notificado."
        )
    else:
        send_message(
            chat_id,
            "Não há ticket pendente de rejeição. Envie /start para ver opções."
        )
    
    return {"ok": True}
