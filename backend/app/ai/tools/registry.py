"""
Tools Registry — carrega tools activos da BD.
Cada tool tem um code_template que define o seu comportamento.
"""
from typing import Any, Callable, Optional
from app.ai.chains.registry import TemplateRegistry


class AIToolRegistry:
    """
    Registry de tools activos carregados da BD.
    Cada tool é uma função Python chamável.
    """

    @classmethod
    def get_tool(cls, name: str, customer_id: Optional[str] = None) -> Optional[dict]:
        """
        Retorna a tool pelo nome.
        """
        all_tools = cls.get_all_tools(customer_id)
        for tool in all_tools:
            if tool.name == name:
                return tool
        return None

    @classmethod
    def get_all_tools(cls, customer_id: Optional[str] = None) -> list[dict]:
        """
        Retorna todas as tools activas como dicts com metadados.
        O code_template está disponível para o agent executar dinamicamente.
        """
        TemplateRegistry._refresh()  # ensure cache is fresh
        raw_tools = TemplateRegistry.get_tools("", customer_id)

        # Se não encontrou com customer_id vazio, tenta sem filtro
        if not raw_tools:
            for ttype in ["notification", "ticket_update", "knowledge_base", "external_api", "classification"]:
                raw_tools += TemplateRegistry.get_tools(ttype, None)

        result = []
        seen = set()
        for tool in raw_tools:
            if tool.name in seen:
                continue
            seen.add(tool.name)
            result.append({
                "id": str(tool.id),
                "name": tool.name,
                "description": tool.description or "",
                "tool_type": tool.tool_type,
                "parameters": tool.parameters or {},
                "code_template": tool.code_template or "",
                "is_default": tool.is_default,
            })
        return result

    @classmethod
    def get_tool_names(cls, customer_id: Optional[str] = None) -> list[str]:
        """Retorna apenas os nomes das tools activas."""
        return [t["name"] for t in cls.get_all_tools(customer_id)]
