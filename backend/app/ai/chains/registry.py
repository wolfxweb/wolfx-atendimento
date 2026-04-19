"""
Registry de templates — carrega templates activos da BD.
Proporciona cache em memória com refresh periódico.
"""
from typing import Optional
from sqlalchemy.orm import Session
from app.models.ai_models import AIPromptTemplate, AITool
from app.database import SessionLocal


class TemplateRegistry:
    """
    Carrega e cacheia templates de prompt da BD.
    O scheduler ou os nodes chamam get_template(type) para obter o prompt activo.
    """
    _cache: dict[tuple[str, Optional[str]], AIPromptTemplate] = {}
    _cache_tools: dict[tuple[str, Optional[str]], list[AITool]] = {}
    _dirty = True

    @classmethod
    def invalidate(cls):
        """Marca o cache como needs refresh."""
        cls._dirty = True

    @classmethod
    def get_template(cls, template_type: str, customer_id: Optional[str] = None) -> Optional[AIPromptTemplate]:
        """
        Obtém o template default activo para o tipo dado.
        Fallback: procura qualquer template activo se não houver default.
        """
        if cls._dirty:
            cls._refresh()

        key = (template_type, customer_id)
        if key in cls._cache:
            return cls._cache[key]

        # Fallback: tenta sem customer_id (global)
        if customer_id:
            key_global = (template_type, None)
            if key_global in cls._cache:
                return cls._cache[key_global]

        return None

    @classmethod
    def get_all_active_templates(cls, customer_id: Optional[str] = None) -> list[AIPromptTemplate]:
        """Retorna todos os templates activos."""
        if cls._dirty:
            cls._refresh()
        return list(cls._cache.values())

    @classmethod
    def _refresh(cls):
        """Refresh cache from database."""
        cls._cache.clear()
        cls._cache_tools.clear()

        db: Session = SessionLocal()
        try:
            # Carrega todos os templates activos, ordenados: default primeiro
            templates = (
                db.query(AIPromptTemplate)
                .filter(AIPromptTemplate.is_active == True)
                .order_by(AIPromptTemplate.is_default.desc())
                .all()
            )

            for t in templates:
                key = (t.type, t.customer_id)
                if key not in cls._cache:
                    cls._cache[key] = t

            # Carrega tools activas
            tools = (
                db.query(AITool)
                .filter(AITool.is_active == True)
                .all()
            )
            for tool in tools:
                tkey = (tool.tool_type, tool.customer_id)
                if tkey not in cls._cache_tools:
                    cls._cache_tools[tkey] = []
                cls._cache_tools[tkey].append(tool)

        finally:
            db.close()

        cls._dirty = False

    @classmethod
    def get_tools(cls, tool_type: str, customer_id: Optional[str] = None) -> list[AITool]:
        """Obtém todas as tools activas para o tipo."""
        if cls._dirty:
            cls._refresh()

        key = (tool_type, customer_id)
        if key in cls._cache_tools:
            return cls._cache_tools[key]

        if customer_id:
            key_global = (tool_type, None)
            if key_global in cls._cache_tools:
                return cls._cache_tools[key_global]

        return []


def render_template(template: str, variables: dict[str, str]) -> str:
    """
    Faz render de um template com variáveis.
    Substitui {variavel} pelo valor correspondente.
    """
    result = template
    for key, value in variables.items():
        result = result.replace(f"{{{key}}}", str(value))
    return result
