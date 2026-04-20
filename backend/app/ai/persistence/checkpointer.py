"""
LangGraph Checkpointer — in-memory implementation.

For production with multi-instance deployment, replace MemorySaver
with PostgresSaver and manage the connection lifecycle properly.
"""
from typing import Optional
from langgraph.checkpoint.memory import MemorySaver


# ── Sync checkpointer (para uso com graph.invoke()) ──────────────

_sync_checkpointer: Optional[MemorySaver] = None


def get_checkpointer() -> MemorySaver:
    """
    Returns a singleton in-memory checkpointer (MemorySaver).
    State is lost on restart — sufficient for single-instance dev/MVP.
    """
    global _sync_checkpointer

    if _sync_checkpointer is None:
        _sync_checkpointer = MemorySaver()

    return _sync_checkpointer


# ── Async checkpointer (para uso com graph.ainvoke()) ──────────

_async_checkpointer: Optional[MemorySaver] = None


def get_async_checkpointer() -> MemorySaver:
    """Returns a singleton async MemorySaver."""
    global _async_checkpointer

    if _async_checkpointer is None:
        _async_checkpointer = MemorySaver()

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
