"""
LangGraph PostgreSQL Checkpointer.

Uses langgraph-checkpoint with a PostgreSQL connection to persist
workflow state between interrupts (human approval) and across restarts.

Usage:
    from app.ai.persistence.checkpointer import get_checkpointer
    checkpointer = get_checkpointer()
"""
import os
from typing import Optional
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


# ── Sync checkpointer (para uso com graph.invoke()) ──────────────

_postgres_url: Optional[str] = None
_sync_checkpointer: Optional[PostgresSaver] = None


def _get_postgres_url() -> str:
    global _postgres_url
    if _postgres_url is None:
        _postgres_url = os.getenv(
            "DATABASE_URL",
            "postgresql://postgres:postgres@postgres:5432/atendimento_db"
        )
    return _postgres_url


def get_checkpointer() -> PostgresSaver:
    """
    Returns a singleton PostgresSaver checkpointer.

    Thread-safe for concurrent graph invocations.
    The underlying PostgresPool handles connection pooling.
    """
    global _sync_checkpointer

    if _sync_checkpointer is None:
        url = _get_postgres_url()
        engine = create_engine(
            url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
        # Auto-create checkpoints table via metadata
        _sync_checkpointer = PostgresSaver.from_engine(engine)
        _sync_checkpointer.setup()   # CREATE TABLE IF NOT EXISTS ...

    return _sync_checkpointer


# ── Async checkpointer (para uso com graph.ainvoke()) ──────────

_async_checkpointer: Optional[AsyncPostgresSaver] = None


def get_async_checkpointer() -> AsyncPostgresSaver:
    """
    Returns a singleton async PostgresSaver for async graph invocations.
    """
    global _async_checkpointer

    if _async_checkpointer is None:
        url = _get_postgres_url()
        _async_checkpointer = AsyncPostgresSaver.from_conn_str(url)
        _async_checkpointer.setup()

    return _async_checkpointer


# ── Config helpers ──────────────────────────────────────────────

def get_thread_config(thread_id: str, **extra) -> dict:
    """
    Returns the config dict for a LangGraph thread.

    Args:
        thread_id: Unique identifier for this workflow execution.
                   Use the execution's UUID as thread_id.
        **extra: Additional config values (e.g., configurable=dict(version="v1"))
    """
    return {
        "configurable": {
            "thread_id": thread_id,
            **extra,
        }
    }
