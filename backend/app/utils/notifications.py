"""
Sistema de notificações Telegram genérico para todos os projetos
- Aprovações de tickets
- Relatórios de testes
- Notificações de PR
"""
import os
import requests
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum

# Telegram Bot API
TELEGRAM_API = "https://api.telegram.org/bot{}/{}"
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "8312031269:AAFto1ZfqRbj3e4mWYEBsV4KgaJ7GLGgVJ8")
DEFAULT_CHAT_ID = os.getenv("TELEGRAM_DEFAULT_CHAT_ID", "1229273513")  # Eduardo Wolf


class NotificationType(str, Enum):
    TICKET_RESOLVED = "ticket_resolved"
    TICKET_APPROVED = "ticket_approved"
    TICKET_REJECTED = "ticket_rejected"
    TEST_REPORT = "test_report"
    PR_CREATED = "pr_created"
    PR_UPDATED = "pr_updated"
    PR_MERGED = "pr_merged"
    DEPLOY_SUCCESS = "deploy_success"
    DEPLOY_FAILED = "deploy_failed"
    SLA_WARNING = "sla_warning"
    SLA_BREACHED = "sla_breached"


# =====================
# BASE FUNCTIONS
# =====================

def send_message(
    chat_id: str,
    text: str,
    parse_mode: str = "Markdown",
    reply_markup: Optional[dict] = None,
    disable_web_preview: bool = True
) -> dict:
    """Envia mensagem via Telegram Bot API"""
    url = TELEGRAM_API.format(BOT_TOKEN, "sendMessage")
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": disable_web_preview,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    
    response = requests.post(url, json=payload, timeout=10)
    return response.json()


def send_photo(chat_id: str, photo_url: str, caption: str = None, parse_mode: str = "Markdown") -> dict:
    """Envia foto (para relatórios com gráficos)"""
    url = TELEGRAM_API.format(BOT_TOKEN, "sendPhoto")
    payload = {
        "chat_id": chat_id,
        "photo": photo_url,
        "parse_mode": parse_mode,
    }
    if caption:
        payload["caption"] = caption
    
    response = requests.post(url, json=payload, timeout=10)
    return response.json()


def send_document(chat_id: str, file_path: str, caption: str = None) -> dict:
    """Envia documento (relatórios JSON, PDFs)"""
    url = TELEGRAM_API.format(BOT_TOKEN, "sendDocument")
    with open(file_path, "rb") as f:
        files = {"document": f}
        data = {"chat_id": chat_id}
        if caption:
            data["caption"] = caption
        response = requests.post(url, data=data, files=files, timeout=30)
    return response.json()


def answer_callback(callback_query_id: str, text: str = "Processado!", show_alert: bool = True) -> dict:
    """Responde ao callback query"""
    url = TELEGRAM_API.format(BOT_TOKEN, "answerCallbackQuery")
    payload = {
        "callback_query_id": callback_query_id,
        "text": text,
        "show_alert": show_alert
    }
    response = requests.post(url, json=payload, timeout=10)
    return response.json()


# =====================
# PROJECT AGNOSTIC HELPERS
# =====================

def get_chat_ids_for_project(project_name: str) -> List[str]:
    """
    Retorna lista de chat_ids autorizados para um projeto.
    Em produção isto viria de uma BD.
    Por agora retorna o chat default.
    """
    # TODO: Buscar de BD por project_name
    # Por agora retorna sempre o admin
    return [DEFAULT_CHAT_ID]


def notify_project(project_name: str, message: str, notification_type: NotificationType = None) -> dict:
    """Envia notificação para todos os chats associados a um projeto"""
    chat_ids = get_chat_ids_for_project(project_name)
    results = []
    for chat_id in chat_ids:
        result = send_message(chat_id, f"🏷️ *{project_name}*\n\n{message}")
        results.append(result)
    return results


# =====================
# TICKET APPROVALS
# =====================

def send_ticket_approval_request(
    chat_id: str,
    ticket_id: str,
    ticket_title: str,
    agent_name: str,
    resolution_summary: str,
    project_name: str = "wolfx-atendimento",
    approve_callback: str = None,
    reject_callback: str = None
):
    """
    Envia pedido de aprovação de ticket via Telegram.
    approve_callback e reject_callback são URLs ou IDs de callback.
    """
    text = f"""✅ *Ticket Resolvido - Aprovação Necessária*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 Projeto: {project_name}
🔖 Ticket: `#{ticket_id}`
📝 Título: {ticket_title}

👤 Resolvido por: {agent_name}
📋 Resumo: {resolution_summary}

O cliente precisa aprovar o encerramento deste ticket."""

    inline_keyboard = {
        "inline_keyboard": [
            [
                {"text": "✅ Aprovar", "callback_data": f"approve:{project_name}:{ticket_id}"},
                {"text": "❌ Rejeitar", "callback_data": f"reject:{project_name}:{ticket_id}"},
            ]
        ]
    }
    
    return send_message(chat_id, text, reply_markup=inline_keyboard)


def send_ticket_approved(chat_ids: List[str], ticket_id: str, ticket_title: str, project_name: str):
    """Notifica que ticket foi aprovado"""
    text = f"""✅ *Ticket Aprovado*
━━━━━━━━━━━━━━━━━━━
📌 Projeto: {project_name}
🔖 Ticket: `#{ticket_id}`
📝: {ticket_title}

O ticket foi aprovado e encerrado."""
    
    for chat_id in chat_ids:
        send_message(chat_id, text)


def send_ticket_rejected(chat_ids: List[str], ticket_id: str, ticket_title: str, reason: str, project_name: str):
    """Notifica que ticket foi rejeitado"""
    text = f"""❌ *Ticket Reaberto*
━━━━━━━━━━━━━━━━━━━
📌 Projeto: {project_name}
🔖 Ticket: `#{ticket_id}`
📝: {ticket_title}

💬 Motivo: {reason}

O ticket foi reaberto para revisão."""
    
    for chat_id in chat_ids:
        send_message(chat_id, text)


# =====================
# TEST REPORTS
# =====================

def format_test_report(
    project_name: str,
    branch: str,
    commit_sha: str,
    total_tests: int,
    passed: int,
    failed: int,
    skipped: int,
    duration: float,
    pytest_output: str = None,
    coverage: float = None
) -> str:
    """Formata relatório de testes para Telegram"""
    
    status_emoji = "✅" if failed == 0 else "❌"
    
    text = f"""{status_emoji} *Test Report - {project_name}*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌿 Branch: `{branch}`
� commit: `{commit_sha[:8]}`
⏱️ Duração: {duration:.1f}s

📊 *Resultados:*
• Total: {total_tests}
• ✅ Passaram: {passed}
• ❌ Falharam: {failed}
• ⏭️ Saltados: {skipped}"""

    if coverage is not None:
        coverage_emoji = "🟢" if coverage >= 80 else "🟡" if coverage >= 60 else "🔴"
        text += f"\n• {coverage_emoji} Coverage: {coverage:.1f}%"

    if failed > 0:
        text += f"\n\n🚨 *{failed} teste(s) falharam!*\nVerificar logs para detalhes."

    if pytest_output and failed > 0:
        # Pegar só as últimas linhas do output
        lines = pytest_output.strip().split("\n")
        error_lines = [l for l in lines if "FAILED" in l or "ERROR" in l or "AssertionError" in l]
        if error_lines:
            text += "\n\n📋 *Erros:*\n" + "\n".join(error_lines[-5:])  # Últimos 5 erros

    text += f"\n\n🔗 Ver detalhes no CI/CD"
    
    return text


def send_test_report(
    chat_ids: List[str],
    project_name: str,
    branch: str,
    commit_sha: str,
    total_tests: int,
    passed: int,
    failed: int,
    skipped: int,
    duration: float,
    pytest_output: str = None,
    coverage: float = None
) -> List[dict]:
    """Envia relatório de testes para múltiplos destinatários"""
    text = format_test_report(
        project_name, branch, commit_sha,
        total_tests, passed, failed, skipped, duration, pytest_output, coverage
    )
    
    results = []
    for chat_id in chat_ids:
        result = send_message(chat_id, text)
        results.append(result)
    
    return results


def send_test_report_file(
    chat_id: str,
    project_name: str,
    branch: str,
    report_file_path: str,
    summary: dict
) -> dict:
    """Envia relatório de testes como documento (JSON report do pytest)"""
    caption = f"📊 Test Report: {project_name} ({branch})"
    return send_document(chat_id, report_file_path, caption)


# =====================
# PR NOTIFICATIONS
# =====================

def send_pr_created(
    chat_ids: List[str],
    project_name: str,
    pr_number: int,
    pr_title: str,
    pr_body: str,
    author: str,
    branch: str,
    base_branch: str,
    url: str
):
    """Notifica criação de PR"""
    text = f"""🆕 *Pull Request Criado*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 Projeto: {project_name}
#️⃣ PR: `#{pr_number}`
📝 Título: {pr_title}

👤 Autor: {author}
🌿 De: `{branch}` → `{base_branch}`

💬 {pr_body[:200] if pr_body else 'Sem descrição'}{'...' if pr_body and len(pr_body) > 200 else ''}

🔗 {url}"""

    for chat_id in chat_ids:
        send_message(chat_id, text)


def send_pr_updated(
    chat_ids: List[str],
    project_name: str,
    pr_number: int,
    pr_title: str,
    action: str,  # opened, closed, merged, review_requested, etc.
    author: str,
    url: str
):
    """Notifica atualização de PR"""
    action_text = {
        "opened": "PR aberto para review",
        "closed": "PR fechado",
        "merged": "PR merged! 🎉",
        "review_requested": "Review solicitado",
        "approved": "Aprovado! ✅",
        "changes_requested": "Alterações solicitadas",
    }
    
    text = f"""📝 *PR Atualizado*
━━━━━━━━━━━━━━━━━━━
📌 Projeto: {project_name}
#️⃣ PR: `#{pr_number}`
📝: {pr_title}

{action_text.get(action, action)}
👤 Por: {author}

🔗 {url}"""

    for chat_id in chat_ids:
        send_message(chat_id, text)


def send_pr_merged(
    chat_ids: List[str],
    project_name: str,
    pr_number: int,
    pr_title: str,
    merged_by: str,
    branch: str,
    url: str
):
    """Notifica que PR foi merged"""
    text = f"""🎉 *PR Merged!*
━━━━━━━━━━━━━━━━━━━
📌 Projeto: {project_name}
#️⃣ PR: `#{pr_number}`
📝: {pr_title}

✅ Mergeado por: {merged_by}
🌿 Branch: `{branch}`

🔗 {url}"""

    for chat_id in chat_ids:
        send_message(chat_id, text)


# =====================
# DEPLOY NOTIFICATIONS
# =====================

def send_deploy_success(
    chat_ids: List[str],
    project_name: str,
    environment: str,
    version: str,
    deployed_by: str,
    duration: float = None
):
    """Notifica deploy bem sucedido"""
    duration_text = f" ({duration:.1f}s)" if duration else ""
    
    text = f"""🚀 *Deploy Bem Sucedido!*
━━━━━━━━━━━━━━━━━━━
📌 Projeto: {project_name}
� Environment: `{environment}`
📦 Versão: `{version}`
👤 Por: {deployed_by}{duration_text}

✅ Pronto em produção"""

    for chat_id in chat_ids:
        send_message(chat_id, text)


def send_deploy_failed(
    chat_ids: List[str],
    project_name: str,
    environment: str,
    version: str,
    error: str,
    deployed_by: str
):
    """Notifica deploy falhou"""
    text = f"""🚨 *Deploy Falhou!*
━━━━━━━━━━━━━━━━━━━
📌 Projeto: {project_name}
� Environment: `{environment}`
📦 Versão: `{version}`
👤 Por: {deployed_by}

❌ Erro:
```
{error[:500]}
```"""

    for chat_id in chat_ids:
        send_message(chat_id, text)


# =====================
# SLA NOTIFICATIONS
# =====================

def send_sla_warning(
    chat_ids: List[str],
    ticket_id: str,
    ticket_title: str,
    minutes_remaining: int,
    project_name: str = "wolfx-atendimento"
):
    """Alerta de SLA em risco"""
    text = f"""⚠️ *SLA em Risco*
━━━━━━━━━━━━━━━━━━━
📌 Projeto: {project_name}
🔖 Ticket: `#{ticket_id}`
📝: {ticket_title}

⏰ Tempo restante: {minutes_remaining} minutos

Ação necessária!""

    for chat_id in chat_ids:
        send_message(chat_id, text)


def send_sla_breached(
    chat_ids: List[str],
    ticket_id: str,
    ticket_title: str,
    project_name: str = "wolfx-atendimento"
):
    """Alerta de SLA violado"""
    text = f"""🚨 *SLA Violado!*
━━━━━━━━━━━━━━━━━━━
📌 Projeto: {project_name}
🔖 Ticket: `#{ticket_id}`
📝: {ticket_title}

⏰ O prazo de resposta expirou!
É necessário agir imediatamente!"""

    for chat_id in chat_ids:
        send_message(chat_id, text)
