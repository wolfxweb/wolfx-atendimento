import os
import requests
from typing import Optional, List
from urllib.parse import urlencode

# Telegram Bot API
TELEGRAM_API = "https://api.telegram.org/bot{}/{}"
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "8312031269:AAFto1ZfqRbj3e4mWYEBsV4KgaJ7GLGgVJ8")


def send_message(
    chat_id: str,
    text: str,
    parse_mode: str = "Markdown",
    reply_markup: Optional[dict] = None
) -> dict:
    """Envia mensagem via Telegram Bot API"""
    url = TELEGRAM_API.format(BOT_TOKEN, "sendMessage")
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    
    response = requests.post(url, json=payload)
    return response.json()


def send_ticket_resolved(
    chat_id: str,
    ticket_id: str,
    title: str,
    agent_name: str,
    resolution_summary: str
):
    """Envia notificação de ticket resolvido com botões de aprovação"""
    text = f"""✅ *Ticket #{ticket_id} resolvido*
━━━━━━━━━━━━━━━━━━━
{agent_name} resolveu seu ticket:

*{title}*

📝 *Resumo:* {resolution_summary}

O que deseja fazer?"""

    inline_keyboard = {
        "inline_keyboard": [
            [
                {"text": "✅ Aprovar", "callback_data": f"approve:{ticket_id}"},
                {"text": "❌ Rejeitar", "callback_data": f"reject:{ticket_id}"},
            ]
        ]
    }
    
    return send_message(
        chat_id=chat_id,
        text=text,
        reply_markup=inline_keyboard
    )


def send_new_ticket_notification(
    chat_ids: List[str],
    customer_name: str,
    ticket_id: str,
    ticket_title: str,
    priority: str
):
    """Notifica agentes de novo ticket"""
    emoji = {"low": "🟢", "normal": "🔵", "high": "🟠", "urgent": "🔴"}
    
    text = f"""🎫 *Novo Ticket*
━━━━━━━━━━━━━━━━━━━
📌 Prioridade: {emoji.get(priority, '🔵')} {priority.upper()}
👤 Cliente: {customer_name}
📝 Título: {ticket_title}
🔗 ID: `{ticket_id}`"""

    for chat_id in chat_ids:
        send_message(chat_id=chat_id, text=text)


def send_ticket_reopened(
    chat_ids: List[str],
    ticket_id: str,
    title: str,
    customer_name: str,
    comment: str
):
    """Notifica agentes que ticket foi reaberto"""
    text = f"""🔴 *Ticket Reaberto*
━━━━━━━━━━━━━━━━━━━
👤 Cliente: {customer_name}
📝 Título: {title}
💬 Comentário: _{comment}_
🔗 ID: `{ticket_id}`"""

    for chat_id in chat_ids:
        send_message(chat_id=chat_id, text=text)


def send_sla_warning(chat_ids: List[str], ticket_id: str, title: str, minutes_remaining: int):
    """Alerta de SLA em risco"""
    text = f"""⚠️ *SLA em Risco*
━━━━━━━━━━━━━━━━━━━
Ticket #{ticket_id}: {title}
⏰ Tempo restante: {minutes_remaining} minutos"""

    for chat_id in chat_ids:
        send_message(chat_id=chat_id, text=text)


def send_sla_breached(chat_ids: List[str], ticket_id: str, title: str):
    """Alerta de SLA violado"""
    text = f"""🚨 *SLA Violado!*
━━━━━━━━━━━━━━━━━━━
Ticket #{ticket_id}: {title}
⏰ O prazo de resposta expirou!"""

    for chat_id in chat_ids:
        send_message(chat_id=chat_id, text=text)


def answer_callback(callback_query_id: str, text: str = "Processado!"):
    """Responde ao callback query"""
    url = TELEGRAM_API.format(BOT_TOKEN, "answerCallbackQuery")
    payload = {
        "callback_query_id": callback_query_id,
        "text": text,
        "show_alert": True
    }
    requests.post(url, json=payload)
