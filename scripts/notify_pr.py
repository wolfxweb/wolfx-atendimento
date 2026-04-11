#!/usr/bin/env python3
"""
PR Notifier - Envia notificações de PR para Telegram
Uso: python notify_pr.py --action created --pr 123 --title "Fix bug" --author user --branch feature --base main --url https://github.com/...
"""
import os
import sys
import argparse

# Adicionar o diretório do backend ao path (dois níveis acima de scripts/)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

try:
    from app.utils.notifications import (
        send_pr_created, send_pr_updated, send_pr_merged,
        send_message, DEFAULT_CHAT_ID
    )
    NOTIFICATIONS_AVAILABLE = True
except ImportError:
    NOTIFICATIONS_AVAILABLE = False
    print("Aviso: módulo de notificações não disponível")


def main():
    parser = argparse.ArgumentParser(description="Notifica PRs via Telegram")
    parser.add_argument("--action", required=True, 
                        choices=["created", "updated", "merged", "closed", "approved"])
    parser.add_argument("--pr", type=int, required=True, help="Número do PR")
    parser.add_argument("--title", required=True, help="Título do PR")
    parser.add_argument("--body", default="", help="Descrição do PR")
    parser.add_argument("--author", required=True, help="Autor do PR")
    parser.add_argument("--branch", required=True, help="Branch do PR")
    parser.add_argument("--base", default="main", help="Branch base")
    parser.add_argument("--url", required=True, help="URL do PR")
    parser.add_argument("--project", default=os.getenv("CI_PROJECT_NAME", "github"), help="Nome do projeto")
    parser.add_argument("--chat-id", default=os.getenv("TELEGRAM_CHAT_ID", DEFAULT_CHAT_ID), help="Chat ID")
    parser.add_argument("--merged-by", help="Quem mergeou (para action=merged)")
    
    args = parser.parse_args()
    
    if not NOTIFICATIONS_AVAILABLE:
        print("Erro: módulo de notificações não disponível")
        sys.exit(1)
    
    chat_ids = [args.chat_id] if args.chat_id else [DEFAULT_CHAT_ID]
    
    if args.action == "created":
        send_pr_created(
            chat_ids=chat_ids,
            project_name=args.project,
            pr_number=args.pr,
            pr_title=args.title,
            pr_body=args.body,
            author=args.author,
            branch=args.branch,
            base_branch=args.base,
            url=args.url
        )
        print(f"✅ Notificação de PR criado enviada para {len(chat_ids)} destinatário(s)")
    
    elif args.action == "merged":
        send_pr_merged(
            chat_ids=chat_ids,
            project_name=args.project,
            pr_number=args.pr,
            pr_title=args.title,
            merged_by=args.merged_by or args.author,
            branch=args.branch,
            url=args.url
        )
        print(f"✅ Notificação de PR merged enviada para {len(chat_ids)} destinatário(s)")
    
    else:
        send_pr_updated(
            chat_ids=chat_ids,
            project_name=args.project,
            pr_number=args.pr,
            pr_title=args.title,
            action=args.action,
            author=args.author,
            url=args.url
        )
        print(f"✅ Notificação de PR atualizada enviada para {len(chat_ids)} destinatário(s)")


if __name__ == "__main__":
    main()
