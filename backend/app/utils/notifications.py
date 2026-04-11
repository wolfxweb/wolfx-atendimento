"""
Sistema de notificacoes Telegram genérico para todos os projetos
- Aprovacoes de tickets
- Relatorios de testes
- Notificacoes de PR
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
# EMOJIS (Unicode safe)
# =====================
EMOJI_OK = "\u2705"
EMOJI_FAIL = "\u274c"
EMOJI_SKIP = "\u23ed"
EMOJI_WARN = "\u26a0\ufe0f"
EMOJI_ROCKET = "\U0001f680"
EMOJI_FIRE = "\U0001f525"
EMOJI_NEW = "\U0001f195"
EMOJI_UPDATE = "\U0001f4dd"
EMOJI_MERGE = "\U0001f389"
EMOJI_BRANCH = "\U0001f4c7"
EMOJI_COMMIT = "\U0001f4c4"
EMOJI_CLOCK = "\u23f0"
EMOJI_Hourglass = "\u23f3"
EMOJI_ALERT = "\U0001f6a8"
EMOJI_TICKET = "\U0001f3ab"
EMOJI_BOOK = "\U0001f4d6"
EMOJI_LINK = "\U0001f517"


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
    """Envia foto (para relatorios com graficos)"""
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
    """Envia documento (relatorios JSON, PDFs)"""
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
    Em producao isto viria de uma BD.
    Por agora retorna o chat default.
    """
    return [DEFAULT_CHAT_ID]


def notify_project(project_name: str, message: str, notification_type: NotificationType = None) -> dict:
    """Envia notificacao para todos os chats associados a um projeto"""
    chat_ids = get_chat_ids_for_project(project_name)
    results = []
    for chat_id in chat_ids:
        result = send_message(chat_id, "{} *{}*\n\n{}".format(EMOJI_BOOK, project_name, message))
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
    Envia pedido de aprovacao de ticket via Telegram.
    approve_callback e reject_callback sao URLs ou IDs de callback.
    """
    text = (
        "{} *Ticket Resolvido - Aprovacao Necessaria*\n"
        "\u2500" * 20 + "\n"
        "\U0001f4cc Projeto: {}\n"
        "\U0001f516 Ticket: `{}`\n"
        "\U0001f4dd Titulo: {}\n\n"
        "\U0001f464 Resolvido por: {}\n"
        "\U0001f4cb Resumo: {}\n\n"
        "O cliente precisa aprovar o encerramento deste ticket."
    ).format(
        EMOJI_OK, project_name, ticket_id, ticket_title,
        agent_name, resolution_summary
    )

    inline_keyboard = {
        "inline_keyboard": [
            [
                {"text": "{} Aprovar".format(EMOJI_OK), "callback_data": "approve:{}:{}".format(project_name, ticket_id)},
                {"text": "{} Rejeitar".format(EMOJI_FAIL), "callback_data": "reject:{}:{}".format(project_name, ticket_id)},
            ]
        ]
    }
    
    return send_message(chat_id, text, reply_markup=inline_keyboard)


def send_ticket_approved(chat_ids: List[str], ticket_id: str, ticket_title: str, project_name: str):
    """Notifica que ticket foi aprovado"""
    text = (
        "{} *Ticket Aprovado*\n"
        "\u2500" * 20 + "\n"
        "\U0001f4cc Projeto: {}\n"
        "\U0001f516 Ticket: `{}`\n"
        "\U0001f4dd: {}\n\n"
        "O ticket foi aprovado e encerrado."
    ).format(EMOJI_OK, project_name, ticket_id, ticket_title)
    
    for chat_id in chat_ids:
        send_message(chat_id, text)


def send_ticket_rejected(chat_ids: List[str], ticket_id: str, ticket_title: str, reason: str, project_name: str):
    """Notifica que ticket foi rejeitado"""
    text = (
        "{} *Ticket Reaberto*\n"
        "\u2500" * 20 + "\n"
        "\U0001f4cc Projeto: {}\n"
        "\U0001f516 Ticket: `{}`\n"
        "\U0001f4dd: {}\n\n"
        "\U0001f4ac Motivo: {}\n\n"
        "O ticket foi reaberto para revisao."
    ).format(EMOJI_FAIL, project_name, ticket_id, ticket_title, reason)
    
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
    """Formata relatorio de testes para Telegram"""
    
    status_emoji = EMOJI_OK if failed == 0 else EMOJI_FAIL
    
    text = (
        "{} *Test Report - {}*\n"
        "\u2500" * 30 + "\n"
        "{} Branch: `{}`\n"
        "{} Commit: `{}`\n"
        "{} Duracao: {:.1f}s\n\n"
        "*Resultados:*\n"
        "- Total: {}\n"
        "- {} Passaram: {}\n"
        "- {} Falharam: {}\n"
        "- {} Saltados: {}"
    ).format(
        status_emoji, project_name,
        EMOJI_BRANCH, branch,
        EMOJI_COMMIT, commit_sha[:8],
        EMOJI_CLOCK, duration,
        EMOJI_OK, passed,
        EMOJI_FAIL, failed,
        EMOJI_SKIP, skipped
    )

    if coverage is not None:
        coverage_emoji = "\U0001f7e2" if coverage >= 80 else "\U0001f7e1" if coverage >= 60 else "\U0001f534"
        text += "\n- {} Coverage: {:.1f}%".format(coverage_emoji, coverage)

    if failed > 0:
        text += "\n\n{} *{} teste(s) falharam!*\nVerificar logs para detalhes.".format(EMOJI_FAIL, failed)

    if pytest_output and failed > 0:
        lines = pytest_output.strip().split("\n")
        error_lines = [l for l in lines if "FAILED" in l or "ERROR" in l or "AssertionError" in l]
        if error_lines:
            text += "\n\n*Erros:*\n" + "\n".join(error_lines[-5:])

    text += "\n\n" + EMOJI_LINK + " Ver detalhes no CI/CD"
    
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
    """Envia relatorio de testes para multiplos destinatarios"""
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
    """Envia relatorio de testes como documento (JSON report do pytest)"""
    caption = "Test Report: {} ({})".format(project_name, branch)
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
    """Notifica criacao de PR"""
    body_preview = (pr_body[:200] + "...") if pr_body and len(pr_body) > 200 else (pr_body or "Sem descricao")
    
    text = (
        "{} *Pull Request Criado*\n"
        "\u2500" * 30 + "\n"
        "\U0001f4cc Projeto: {}\n"
        "#{} PR: `#{}`\n"
        "\U0001f4dd Titulo: {}\n\n"
        "\U0001f464 Autor: {}\n"
        "{} De: `{}` -> `{}`\n\n"
        "{} {}\n\n"
        "{} {}"
    ).format(
        EMOJI_NEW, project_name,
        "\U0001f4cc", pr_number,
        pr_title,
        author,
        EMOJI_BRANCH, branch, base_branch,
        "\U0001f4ac", body_preview,
        EMOJI_LINK, url
    )

    for chat_id in chat_ids:
        send_message(chat_id, text)


def send_pr_updated(
    chat_ids: List[str],
    project_name: str,
    pr_number: int,
    pr_title: str,
    action: str,
    author: str,
    url: str
):
    """Notifica atualizacao de PR"""
    action_text = {
        "opened": "PR aberto para review",
        "closed": "PR fechado",
        "merged": "PR merged! " + EMOJI_MERGE,
        "review_requested": "Review solicitado",
        "approved": "Aprovado! " + EMOJI_OK,
        "changes_requested": "Alteracoes solicitadas",
    }
    
    text = (
        "{} *PR Atualizado*\n"
        "\u2500" * 20 + "\n"
        "\U0001f4cc Projeto: {}\n"
        "#{} PR: `#{ }`\n"
        "\U0001f4dd: {}\n\n"
        "{}\n"
        "\U0001f464 Por: {}\n\n"
        "{} {}"
    ).format(
        EMOJI_UPDATE, project_name,
        "\U0001f4cc", pr_number, pr_number,
        pr_title,
        action_text.get(action, action),
        author,
        EMOJI_LINK, url
    )

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
    text = (
        "{} *PR Merged!*\n"
        "\u2500" * 20 + "\n"
        "\U0001f4cc Projeto: {}\n"
        "#{} PR: `#{ }`\n"
        "\U0001f4dd: {}\n\n"
        "{} Mergeado por: {}\n"
        "{} Branch: `{}`\n\n"
        "{} {}"
    ).format(
        EMOJI_MERGE, project_name,
        "\U0001f4cc", pr_number, pr_number,
        pr_title,
        EMOJI_OK, merged_by,
        EMOJI_BRANCH, branch,
        EMOJI_LINK, url
    )

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
    duration_text = " ({:.1f}s)".format(duration) if duration else ""
    
    text = (
        "{} *Deploy Bem Sucedido!*\n"
        "\u2500" * 20 + "\n"
        "\U0001f4cc Projeto: {}\n"
        "\U0001f3af Environment: `{}`\n"
        "\U0001f4e6 Versao: `{}`\n"
        "\U0001f464 Por: {}{}\n\n"
        "{} Pronto em producao"
    ).format(
        EMOJI_ROCKET, project_name,
        environment,
        version,
        deployed_by, duration_text,
        EMOJI_OK
    )

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
    text = (
        "{} *Deploy Falhou!*\n"
        "\u2500" * 20 + "\n"
        "\U0001f4cc Projeto: {}\n"
        "\U0001f3af Environment: `{}`\n"
        "\U0001f4e6 Versao: `{}`\n"
        "\U0001f464 Por: {}\n\n"
        "{} Erro:\n"
        "```\n{}\n```"
    ).format(
        EMOJI_FIRE, project_name,
        environment,
        version,
        deployed_by,
        EMOJI_FAIL,
        error[:500]
    )

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
    text = (
        "{} *SLA em Risco*\n"
        "\u2500" * 20 + "\n"
        "\U0001f4cc Projeto: {}\n"
        "\U0001f516 Ticket: `{}`\n"
        "\U0001f4dd: {}\n\n"
        "{} Tempo restante: {} minutos\n\n"
        "Acao necessaria!"
    ).format(
        EMOJI_WARN, project_name,
        ticket_id, ticket_title,
        EMOJI_CLOCK, minutes_remaining
    )

    for chat_id in chat_ids:
        send_message(chat_id, text)


def send_sla_breached(
    chat_ids: List[str],
    ticket_id: str,
    ticket_title: str,
    project_name: str = "wolfx-atendimento"
):
    """Alerta de SLA violado"""
    text = (
        "{} *SLA Violado!*\n"
        "\u2500" * 20 + "\n"
        "\U0001f4cc Projeto: {}\n"
        "\U0001f516 Ticket: `{}`\n"
        "\U0001f4dd: {}\n\n"
        "{} O prazo de resposta expirou!\n"
        "E necessario agir imediatamente!"
    ).format(
        EMOJI_ALERT, project_name,
        ticket_id, ticket_title,
        EMOJI_Hourglass
    )

    for chat_id in chat_ids:
        send_message(chat_id, text)
