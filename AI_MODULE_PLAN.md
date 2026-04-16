# Módulo de IA — wolfx-atendimento
## Plano Completo de Arquitetura e Implementação

---

## 1. Visão Geral

Sistema de IA para processamento automático de tickets do helpdesk, com
aprovação humana para ações críticas. O scheduler verifica tickets pendentes
a cada 5 minutos e acciona workflows LangGraph que usam LLM para
classificar, sugerir respostas, buscar artigos KB e escalar quando necessário.

**Modelo LLM:** MiniMax (`sk-cp-***`) — 100% das tarefas
**Endpoint:** `https://api.minimax.chat/v1`
**Tool Calling:** MiniMax supporta function calling — agente LangChain com tools
**Arquitectura:** MiniMax-only — um modelo para tudo (classificação, resposta, RAG, agente com tools)

---

## 2. Arquitectura MiniMax — Responsabilidades

```
┌─────────────────────────────────────────────────────────────┐
│  SCHEDULER (APScheduler — a cada 5 min)                     │
│  • Busca tickets elegíveis                                  │
│  • Dispara workflow via thread (não bloqueia scheduler)     │
│  • Limite: máx 5 execuções concurrently                    │
│  • Advisory lock PostgreSQL para evitar overlap             │
└──────────────────────┬──────────────────────────────────────┘
                     │ dispatch
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  LANGGRAPH WORKFLOW ENGINE                                  │
│  • Estado: TicketAgentState (TypedDict)                     │
│  • Persistência: PostgreSQL (checkpointer LangGraph)        │
│  • Pontos de interrupção: human_approval                    │
│  • Retry: máx 3 vezes por nó                              │
└──────────┬──────────────────────────────────────────────────┘
           │
           ├──► MiniMax (classificação)
           │    ─ Sem tool calling — chat completions básico
           │    ─ Prompt com output JSON (JsonOutputParser)
           │
           ├──► MiniMax (resposta sugerida + RAG query)
           │    ─ Sem tool calling — gera texto e query de busca
           │
           ├──► MiniMax (agente com tools)
           │    ─ Tool calling activo — function calling nativo
           │    ─ Tools: get_ticket, update_ticket_field,
           │              notify_agent, save_suggestion,
           │              escalate_ticket, search_kb
           │
           └──► HUMAN-IN-LOOP (interrupção)
                ─ Grava checkpoint LangGraph
                ─ Cria AIApproval no banco
                ─ Notifica agentes (Telegram)
                ─ Aguarda aprovação via API
                ─ Resume do checkpoint após aprovação
```

---

## 3. Diagrama de Estados — Ticket + IA

```
                    ┌─ novo ──────────────────────────────────┐
                    │                                          │
                    │  pendente_classificacao                  │
                    │  ┌──────────────────────────────────┐    │
                    │  │  IA classifica (MiniMax)         │    │
                    │  │  confidence < 0.70 → aprova     │    │
                    │  │  priority=urgent → aprova        │    │
                    │  │  intent=refund/legal → aprova    │    │
                    │  └──────┬───────────────────────────┘    │
                    │         │                                 │
                    │         ▼                                 │
                    │  aguardando_aprovacao ───────────────────│
                    │         │                                 │
                    │    ┌────┴────┐                            │
                    │    │ aprova? │                            │
                    │    └───┬────┘                            │
                    │   sim  │  não                             │
                    │    ▼    ▼                                 │
                    │ rag_lookup   finalize (ignora sug.)       │
                    │    │                                      │
                    │    ▼                                      │
                    │  suggest_response                         │
                    │    │                                      │
                    │    ▼                                      │
                    │  aguardando_aprovacao (se acção op.) ───│
                    │    │                                      │
                    │    ▼                                      │
                    │  finalize                                 │
                    │                                          │
                    │  pendente_sla_review                     │
                    │  ┌──────────────────────────────────┐    │
                    │  │  IA revê SLA (Groq agent)         │    │
                    │  │  breach/at-risk → escalonamento  │    │
                    │  └──────────────────────────────────┘    │
                    │                                          │
                    └─ em_atendimento ─────────────────────────┘
                              │
                              ▼
                        resolvido / fechado
```

---

## 4. Tabelas do Banco de Dados

### 4.1 — `ai_workflow_executions`

Controla cada execução individual do workflow LangGraph.

```sql
CREATE TABLE ai_workflow_executions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id        UUID NOT NULL REFERENCES tickets(id),
    workflow_name    VARCHAR(100) NOT NULL,     -- 'ticket_processing', 'sla_review'
    graph_version    VARCHAR(20) NOT NULL,      -- versão do grafo (audit)
    thread_id        VARCHAR(255) NOT NULL,     -- LangGraph thread_id
    status           VARCHAR(30) NOT NULL DEFAULT 'pending',
        -- pending | running | awaiting_approval | approved | rejected
        -- | completed | failed | cancelled
    current_node     VARCHAR(100),              -- último nó executado
    next_node        VARCHAR(100),              -- próximo nó a executar
    payload          JSONB,                    -- {ticket_data, context} input
    result           JSONB,                    -- output final do workflow
    error_message    TEXT,
    retry_count      INTEGER DEFAULT 0,
    max_retries      INTEGER DEFAULT 3,
    scheduled_at     TIMESTAMP NOT NULL,       -- quando scheduler activou
    started_at       TIMESTAMP,
    finished_at      TIMESTAMP,
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ai_exec_ticket     ON ai_workflow_executions(ticket_id);
CREATE INDEX idx_ai_exec_status    ON ai_workflow_executions(status);
CREATE INDEX idx_ai_exec_pending   ON ai_workflow_executions(scheduled_at)
                                    WHERE status = 'pending';
```

### 4.2 — `ai_approvals`

Aprovações humanas pendentes e histórico.

```sql
CREATE TABLE ai_approvals (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id     UUID NOT NULL REFERENCES ai_workflow_executions(id),
    ticket_id        UUID NOT NULL REFERENCES tickets(id),
    approval_type    VARCHAR(50) NOT NULL,
        -- 'classify_confirm'    — classificação de priority/intent crítica
        -- 'response_confirm'   — resposta com acção operacional
        -- 'escalate_confirm'   — escalonamento proposto
        -- 'close_confirm'      — fecho automático
        -- 'sla_override'        — override de SLA
    step_description TEXT NOT NULL,             -- "IA sugere: priority=urgent..."
    ai_suggestion    JSONB NOT NULL,           -- {priority, confidence, reason, ...}
    human_decision   VARCHAR(20),              -- approved | rejected | expired | null
    human_notes      TEXT,
    approver_user_id UUID REFERENCES users(id),
    approved_at      TIMESTAMP,
    created_at       TIMESTAMP DEFAULT NOW(),
    expires_at       TIMESTAMP,               -- DEFAULT NOW() + 24 hours
    resume_checkpoint JSONB                  -- LangGraph checkpoint snapshot
);

CREATE INDEX idx_ai_appr_execution  ON ai_approvals(execution_id);
CREATE INDEX idx_ai_appr_pending    ON ai_approvals(created_at)
                                     WHERE human_decision IS NULL;
CREATE INDEX idx_ai_appr_ticket     ON ai_approvals(ticket_id);
```

### 4.3 — `ai_audit_log`

Log de auditoria granular — todas as ações da IA.

```sql
CREATE TABLE ai_audit_log (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id     UUID REFERENCES ai_workflow_executions(id),
    ticket_id        UUID REFERENCES tickets(id),
    action           VARCHAR(50) NOT NULL,
        -- 'workflow_started'    — scheduler dispatch
        -- 'node_entered'        — nó LangGraph entrou
        -- 'node_exited'         — nó LangGraph saiu
        -- 'llm_called'          — chamada a GPT-4.5-nano
        -- 'agent_tool_called'   — Groq agent executou tool
        -- 'approval_requested'  — pausa para aprovação humana
        -- 'approval_received'   — humano decidiu
        -- 'workflow_resumed'    — retomar após aprovação
        -- 'workflow_completed'  — terminou com sucesso
        -- 'workflow_failed'     — erro após retries
        -- 'retry'               — retry de nó
    node_name        VARCHAR(100),
    actor            VARCHAR(20) NOT NULL,      -- 'ai' | 'human' | 'system'
    details          JSONB,
    llm_model        VARCHAR(50),              -- 'MiniMax-Text-01'
    llm_prompt_tokens   INTEGER,
    llm_completion_tokens INTEGER,
    latency_ms       INTEGER,
    error_message    TEXT,
    created_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ai_audit_ticket     ON ai_audit_log(ticket_id);
CREATE INDEX idx_ai_audit_execution  ON ai_audit_log(execution_id);
CREATE INDEX idx_ai_audit_created   ON ai_audit_log(created_at DESC);
```

### 4.4 — `ai_ticket_suggestions`

Sugestões geradas pela IA para um ticket (classificação, resposta, etc).

```sql
CREATE TABLE ai_ticket_suggestions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id        UUID NOT NULL REFERENCES tickets(id),
    execution_id     UUID REFERENCES ai_workflow_executions(id),
    suggestion_type  VARCHAR(50) NOT NULL,
        -- 'classification'     — {priority, category, intent, language, confidence}
        -- 'response'           — {text, confidence, references}
        -- 'sla_warning'        — {status, time_remaining, breach_risk}
        -- 'escalation'         — {reason, target_agent_id, priority}
        -- 'kb_article'         — {article_ids, relevance_scores}
    payload          JSONB NOT NULL,           -- dados da sugestão
    confidence       DECIMAL(5,4),            -- 0.0000 a 1.0000
    applied          BOOLEAN DEFAULT FALSE,   -- agente aplicou a sugestão?
    applied_by      UUID REFERENCES users(id),
    applied_at      TIMESTAMP,
    rejected         BOOLEAN DEFAULT FALSE,
    rejected_by     UUID REFERENCES users(id),
    rejected_at     TIMESTAMP,
    rejection_reason TEXT,
    created_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ai_sugg_ticket    ON ai_ticket_suggestions(ticket_id);
CREATE INDEX idx_ai_sugg_type     ON ai_ticket_suggestions(suggestion_type);
CREATE INDEX idx_ai_sugg_applied  ON ai_ticket_suggestions(applied)
                                   WHERE applied = FALSE;
```

### 4.5 — `ai_embeddings` (vectores KB)

Embeddings dos artigos da Base de Conhecimento para RAG.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE ai_embeddings (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id       UUID NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
    chunk_index      INTEGER NOT NULL,
    content_chunk    TEXT NOT NULL,             -- texto segmentado (500-1000 chars)
    embedding        VECTOR(1024),             -- MiniMax embeddings (dimension=1024)
    created_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_emb_article  ON ai_embeddings(article_id);
CREATE INDEX idx_emb_cosine  ON ai_embeddings USING ivfflat
                               (embedding vector_cosine_ops)
                               WITH (lists = 100);
```

### 4.6 — Extensões à tabela `tickets` existente

```sql
ALTER TABLE tickets ADD COLUMN ai_processing_status VARCHAR(30)
    DEFAULT 'not_processed';
    -- not_processed | processing | awaiting_approval | processed | skipped

ALTER TABLE tickets ADD COLUMN ai_last_node       VARCHAR(100);
ALTER TABLE tickets ADD COLUMN ai_confidence       DECIMAL(5,4);
ALTER TABLE tickets ADD COLUMN ai_classification   JSONB;
ALTER TABLE tickets ADD COLUMN ai_suggested_response TEXT;
ALTER TABLE tickets ADD COLUMN ai_last_action_at   TIMESTAMP;
ALTER TABLE tickets ADD COLUMN ai_execution_id     UUID REFERENCES ai_workflow_executions(id);
```

---

## 5. LangGraph — Definição do Workflow

### 5.1 TicketAgentState (TypedDict)

```python
from typing import TypedDict, Optional, Literal
from uuid import UUID
from datetime import datetime

class TicketAgentState(TypedDict, total=False):
    # ── Identificação ──────────────────────────────────────
    ticket_id:        UUID
    execution_id:     UUID
    thread_id:        str              # LangGraph persistence thread
    graph_version:    str              # Ex: "v1.0.0"

    # ── Dados do ticket (snapshot — evita N+1 queries) ──────
    ticket_data:      dict

    # ── Progresso do workflow ────────────────────────────────
    current_node:      str
    next_node:         Optional[str]
    pending_approval:  bool
    approval_id:       Optional[UUID]

    # ── Resultados dos nós ───────────────────────────────────
    classification:     Optional[dict]   # {priority, category, intent, language,
                                        #   summary, confidence, reason}
    rag_articles:       list[dict]      # [{id, title, content, score}]
    suggested_response: Optional[dict]  # {text, confidence, has_action,
                                        #   operational_action, references}
    sla_status:         Optional[dict]  # {status, time_remaining, breach_risk,
                                        #   sla_id, sla_name}
    escalation_needed:  bool
    escalation_reason:  Optional[str]

    # ── Decisão humana (preenchido após aprovação) ───────────
    human_decision:     Optional[Literal["approved", "rejected"]]
    human_notes:        Optional[str]
    approver_id:        Optional[UUID]

    # ── Controlo de execução ─────────────────────────────────
    retry_count:        int
    error_message:      Optional[str]
    started_at:         datetime
    logs:               list[dict]
```

### 5.2 Nós do Grafo

| Nó | Descrição | Modelo |
|---|---|---|
| `classify` | Classifica ticket (priority, category, intent, language) | GPT-4.5-nano |
| `check_approval_needed` | Decide se precisa aprovação humana | Código Python |
| `rag_lookup` | Busca artigos KB por embedding similarity | GPT-4.5-nano (query) |
| `suggest_response` | Gera sugestão de resposta + detecta acções operacionais | GPT-4.5-nano |
| `sla_review` | Revê SLA e detecta breach/at-risk | Groq agent |
| `escalate` | Escalona ticket para agente/supervisor | Groq agent (tool) |
| `finalize` | Grava resultados no banco, actualiza ticket | Código Python |
| `human_approval_handler` | Processa resultado da aprovação humana | Código Python |

### 5.3 Routing Edges

```
classify ──► check_approval_needed
                     │
            ┌────────┴────────┐
            ▼                 ▼
      (precisa apro.)   (não precisa)
            │                 │
            ▼                 ▼
    human_approval    rag_lookup
            │                 │
            ▼                 ▼
    (após aprovação)  suggest_response
                            │
                   ┌────────┴────────┐
                   ▼                 ▼
             (acção op.)      (sem acção)
                   │                 │
                   ▼                 ▼
          human_approval      finalize
                   │
                   ▼
          (após aprovação)

sla_review ──► (escalation_needed) ──► escalate ──► finalize
                        │
                        ▼ (no escalation)
                     finalize
```

### 5.4 Interrupt Points

O grafo faz `interrupt_before=["human_approval_handler"]` — quando chega a
este nó, o LangGraph pausa e guarda checkpoint automaticamente.

---

## 6. LangChain — Chains e Tools

### 6.1 Classification Chain (MiniMax)

```python
from langchain_openai import ChatOpenAI
from langchain.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field
from typing import Literal

class ClassificationOutput(BaseModel):
    priority:   Literal["low", "normal", "high", "urgent"]
    category:   str = Field(description="Categoria do ticket")
    intent:     Literal["question", "problem", "request", "complaint", "refund", "feedback"]
    language:   str = Field(description="Código ISO do idioma: pt-BR, en, es")
    summary:    str = Field(description="Resumo em uma frase")
    confidence: float = Field(ge=0.0, le=1.0, description="Certeza da classificação")
    reason:     str = Field(description="Justificativa curta")

minimax_llm = ChatOpenAI(
    model="MiniMax-Text-01",
    openai_api_key=MINIMAX_API_KEY,
    openai_api_base="https://api.minimax.chat/v1",
)

classification_chain = (
    PromptTemplate.from_template("""
Eres un asistente de helpdesk. Clasifica el ticket siguiente.

TÍTULO: {title}
DESCRIPCIÓN: {description}
HISTORIAL: {history}

Responda em JSON com os campos: priority, category, intent, language, summary, confidence, reason.
Confidence: número entre 0.0 e 1.0.
""")
    | minimax_llm
    | JsonOutputParser(pydantic_object=ClassificationOutput)
)
```

### 6.2 Response Suggestion Chain (MiniMax)

```python
response_chain = (
    PromptTemplate.from_template("""
Eres un asistente de helpdesk. Genera una sugerencia de respuesta para el ticket.

CONTEXTO DEL TICKET:
- Cliente: {customer_name}
- Prioridad: {priority}
- Categoría: {category}
- Intent: {intent}

TICKET:
Título: {title}
Descripción: {description}

ARTÍCULOS KB RELACIONADOS:
{kb_articles}

Historial de conversaciones:
{history}

Responde en JSON com os campos:
- text: texto da resposta sugerida (formal, no idioma do ticket)
- confidence: número entre 0.0 e 1.0
- has_action: boolean (a resposta contém alguma ação operacional como reembolsar, cancelar, escalar?)
- operational_action: descripción da ação se has_action=true, se não null
- references: lista de IDs de artículos KB usados como referência
""")
    | minimax_llm  # Reusa MiniMax
    | JsonOutputParser()
)
```

### 6.3 MiniMax Agent com Tools (function calling)

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_react_agent, AgentExecutor
from langchain.tools import tool

# ── Tools do Agent ──────────────────────────────────────────

@tool
def get_ticket(ticket_id: str) -> dict:
    """Obtém dados completos de um ticket incluindo histórico."""
    # Implementação: query ao banco, retorna dict
    pass

@tool
def update_ticket_field(ticket_id: str, field: str, value: Any) -> dict:
    """Actualiza um campo específico do ticket."""
    pass

@tool
def save_suggestion(ticket_id: str, suggestion_type: str, payload: dict,
                    confidence: float) -> dict:
    """Guarda uma sugestão da IA na tabela ai_ticket_suggestions."""
    pass

@tool
def notify_agent(agent_id: str, message: str, ticket_id: str) -> dict:
    """Envia notificação a um agente via Telegram."""
    pass

@tool
def escalate_ticket(ticket_id: str, reason: str, target_agent_id: str = None) -> dict:
    """Escalona ticket para um agente específico ou grupo."""
    pass

@tool
def search_kb(query: str, top_k: int = 5) -> list[dict]:
    """Busca artículos na base de conhecimento por texto."""
    pass

@tool
def log_audit(execution_id: str, action: str, details: dict,
              actor: str = "ai") -> dict:
    """Regista uma entrada no log de auditoria ai_audit_log."""
    pass

# ── Agent MiniMax ────────────────────────────────────────────

# MiniMax com tool calling (via langchain-openai + custom base)
minimax_llm = ChatOpenAI(
    model="MiniMax-Text-01",           # ou o modelo com tool calling
    openai_api_key=MINIMAX_API_KEY,
    openai_api_base=MINIMAX_API_BASE,  # "https://api.minimax.chat/v1"
    # Sem temperature — modelos MiniMax usam temperatura fixa
)

tools = [
    get_ticket, update_ticket_field, save_suggestion,
    notify_agent, escalate_ticket, search_kb, log_audit
]

agent = create_react_agent(llm=minimax_llm, tools=tools)
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
```

---

## 7. Scheduler — Processo de 5 Minutos

### 7.1 Fluxo do Scheduler

```
[CADA 5 MINUTOS — schedule.every().minute(5)]

  ┌──────────────────────────────────────────────────────────┐
  │ 1. ADVISORY LOCK                                        │
  │    pg_try_advisory_lock(hash('ai_scheduler_v1'))        │
  │    → Se false, outro scheduler está a correr → sair     │
  └────────────────────────┬────────────────────────────────┘
                           │
  ┌────────────────────────▼────────────────────────────────┐
  │ 2. BUSCAR TICKETS ELEGÍVEIS                             │
  │                                                          │
  │  Query principal:                                       │
  │    SELECT id FROM tickets                               │
  │    WHERE ai_processing_status IN                         │
  │      ('not_processed', 'awaiting_approval')             │
  │    AND status NOT IN ('closed', 'resolved')            │
  │    ORDER BY                                             │
  │      CASE priority WHEN 'urgent' THEN 1                  │
  │                  WHEN 'high'   THEN 2                   │
  │                  WHEN 'normal' THEN 3                   │
  │                  WHEN 'low'    THEN 4                   │
  │      END,                                               │
  │      created_at ASC                                     │
  │    LIMIT 20                                             │
  └────────────────────────┬────────────────────────────────┘
                           │
  ┌────────────────────────▼────────────────────────────────┐
  │ 3. PARA CADA TICKET:                                    │
  │                                                          │
  │    a) Verificar se já existe execution pendente        │
  │       SELECT 1 FROM ai_workflow_executions             │
  │       WHERE ticket_id=? AND status IN ('pending','running','awaiting_approval')
  │       → Se sim, saltar ticket                          │
  │                                                          │
  │    b) Criar ai_workflow_execution record               │
  │       status='pending', thread_id=uuid4()              │
  │                                                          │
  │    c) Dispatch thread assíncrono                       │
  │       run_ticket_workflow(execution_id, ticket_id)     │
  │       (não bloqueia — BackgroundScheduler)             │
  │                                                          │
  │    d) Limite: se já 5 running, esperar                 │
  └────────────────────────┬────────────────────────────────┘
                           │
  ┌────────────────────────▼────────────────────────────────┐
  │ 4. RELEASE ADVISORY LOCK                                │
  │    pg_advisory_unlock(hash('ai_scheduler_v1'))          │
  └──────────────────────────────────────────────────────────┘
```

### 7.2 Queries de Elegibilidade

```sql
-- Tickets novos sem classificação
SELECT id FROM tickets
WHERE ai_processing_status = 'not_processed'
  AND (ai_classification IS NULL OR ai_classification = '{}')
  AND status NOT IN ('closed', 'resolved')
  AND created_at > NOW() - INTERVAL '30 days'
LIMIT 10;

-- Tickets aguardando SLA review (em risco)
SELECT t.id FROM tickets t
JOIN sla ON t.sla_id = sla.id
WHERE t.ai_processing_status = 'not_processed'
  AND t.status IN ('open', 'pending')
  AND (
    (t.sla_response_limit IS NOT NULL AND t.sla_response_limit < NOW())
    OR
    (t.sla_resolution_limit IS NOT NULL AND t.sla_resolution_limit < NOW() + INTERVAL '30 minutes')
  )
LIMIT 5;

-- Tickets com nova mensagem do cliente (sem resposta IA)
SELECT id FROM tickets
WHERE ai_processing_status = 'not_processed'
  AND latest_customer_message_at > COALESCE(ai_last_action_at, created_at)
  AND (ai_suggested_response IS NULL OR ai_suggested_response = '')
LIMIT 5;
```

---

## 8. Processo de Aprovação Humana

### 8.1 Fluxo Completo

```
WORKFLOW LANGGRAPH PAUSA (interrupt_before)
         │
         ▼
  ┌─────────────────────────────────┐
  │ Gravar AIApproval               │
  │  • approval_type                │
  │  • step_description             │
  │  • ai_suggestion (JSON)         │
  │  • resume_checkpoint (LangGraph)│
  │  • expires_at = NOW + 24h       │
  └────────────┬────────────────────┘
               │
               ▼
  ┌─────────────────────────────────┐
  │ Actualizar execution.status     │
  │   = 'awaiting_approval'         │
  └────────────┬────────────────────┘
               │
               ▼
  ┌─────────────────────────────────┐
  │ Actualizar ticket               │
  │  ai_processing_status=          │
  │   'awaiting_approval'           │
  └────────────┬────────────────────┘
               │
               ▼
  ┌─────────────────────────────────┐
  │ Notificar agentes (Telegram)    │
  │  "⚠️ Aprovação IA pendente      │
  │   Ticket #N — [tipo]           │
  │   [descrição da sugestão]"      │
  └────────────┬────────────────────┘
               │
               ▼
         AGENTE DECIDE
          /         \
      Aprovar       Rejeitar
         │             │
         ▼             ▼
  POST /approve    POST /reject
         │             │
         ▼             ▼
  Gravar decisão  Gravar decisão
  + notes         + notes
  + approver_id   + rejected_by
         │             │
         └──────┬──────┘
                ▼
         RESUME WORKFLOW
         (LangGraph Command)
                │
                ▼
         Graph retoma do nó
         que estava pendente
         (human_decision no state)
                │
                ▼
         human_approval_handler
         valida decisão → continua
```

### 8.2 Regras de Aprovação Obrigatória

| Condição | approval_type |
|---|---|
| `confidence < 0.70` | `classify_confirm` |
| `priority = urgent` | `classify_confirm` |
| `intent = refund / legal / data_deletion` | `classify_confirm` |
| `response.has_action = true` | `response_confirm` |
| `sla_status.breach_risk = true` | `escalate_confirm` |
| `ticket sem resposta há > 48h` | `close_confirm` |

---

## 9. Endpoints da API de IA

```
GET    /api/v1/ai/approvals                    Lista aprovações pendentes
GET    /api/v1/ai/approvals/:id                Detalhe de uma aprovação
POST   /api/v1/ai/approvals/:id/approve        Aprovar + resume workflow
POST   /api/v1/ai/approvals/:id/reject         Rejeitar + resume workflow
GET    /api/v1/ai/executions                   Lista execuções (c/ filtros)
GET    /api/v1/ai/executions/:id                Detalhe de execução
GET    /api/v1/ai/executions/:id/logs           Logs de auditoria da execução
GET    /api/v1/ai/stats                         Dashboard: métricas globais
POST   /api/v1/ai/suggestions/:id/apply        Agente aplica sugestão
POST   /api/v1/ai/suggestions/:id/reject       Agente rejeita sugestão
```

### Response — GET /ai/approvals/:id

```json
{
  "id": "uuid",
  "execution_id": "uuid",
  "ticket_id": "uuid",
  "ticket_title": "Não consigo aceder à minha conta",
  "approval_type": "classify_confirm",
  "step_description": "IA sugere: priority=high, category=billing, intent=problem (confiança=62%)",
  "ai_suggestion": {
    "priority": "high",
    "category": "billing",
    "intent": "problem",
    "confidence": 0.62,
    "reason": "Cliente reporta problema de acesso após tentativa de pagamento"
  },
  "human_decision": null,
  "expires_at": "2026-04-17T21:50:00Z",
  "created_at": "2026-04-16T21:50:00Z",
  "approver": null
}
```

---

## 10. Estrutura de Pastas

```
backend/app/ai/
│
├── __init__.py
│
├── models/
│   ├── __init__.py
│   ├── ai_execution.py       # SQLAlchemy: AIWorkflowExecution
│   ├── ai_approval.py        # SQLAlchemy: AIApproval
│   ├── ai_audit.py           # SQLAlchemy: AIAuditLog
│   └── ai_suggestion.py      # SQLAlchemy: AITicketSuggestion
│
├── scheduler/
│   ├── __init__.py
│   ├── scheduler_service.py  # APScheduler — every 5 min
│   └── ticket_selector.py   # Queries de elegibilidade
│
├── workflows/
│   ├── __init__.py
│   ├── ticket_agent.py       # Grafo LangGraph principal
│   ├── state.py              # TicketAgentState TypedDict
│   ├── config.py             # Graph versions, constants
│   │
│   └── nodes/
│       ├── __init__.py
│       ├── classify.py        # Nó: classifica ticket (GPT-4.5-nano)
│       ├── rag_lookup.py      # Nó: busca KB por embeddings
│       ├── suggest_response.py # Nó: sugere resposta (GPT-4.5-nano)
│       ├── sla_review.py      # Nó: revê SLA (Groq agent)
│       ├── escalate.py        # Nó: escalona (Groq agent tool)
│       ├── finalize.py        # Nó: grava resultados no banco
│       └── human_approval.py  # Handler pós-aprovação humana
│
├── chains/
│   ├── __init__.py
│   ├── classification.py     # ClassificationOutput + chain
│   ├── response.py          # ResponseSuggestionOutput + chain
│   └── rag.py               # RAG chain
│
├── tools/
│   ├── __init__.py
│   ├── ticket_tools.py      # get_ticket, update_ticket_field
│   ├── suggestion_tools.py  # save_suggestion, apply_suggestion
│   ├── notification_tools.py # notify_agent (Telegram)
│   ├── kb_tools.py          # search_kb
│   └── audit_tools.py       # log_audit
│
├── embeddings/
│   ├── __init__.py
│   ├── embed_service.py     # MiniMax/minimaxi embeddings
│   └── index_manager.py     # Upsert embeddings no PGVector
│
├── persistence/
│   ├── __init__.py
│   └── langgraph_store.py   # LangGraph PostgreSQL checkpointer
│
└── api/
    ├── __init__.py
    ├── approvals.py         # Endpoints REST approvals
    ├── executions.py        # Endpoints REST executions
    └── stats.py             # Endpoint /stats

frontend/src/pages/admin/
├── AIActivity.tsx            # Dashboard de actividade IA
├── AIApprovals.tsx           # Lista de aprovações pendentes
└── AIApprovalDetail.tsx     # Detalhe + acção de aprovar/rejeitar
```

---

## 11. Variáveis de Ambiente

```env
# MiniMax — 100% das tarefas LLM
MINIMAX_API_KEY=sk-cp-vtYlQ6pnbxEJu-***       # Token MiniMax
MINIMAX_API_BASE=https://api.minimax.chat/v1   # Endpoint fixo

# PostgreSQL (LangGraph checkpointer + будущие vectores)
DATABASE_URL=postgresql://postgres:***@postgres_postgres:5432/atendimento_db

# Notificações
TELEGRAM_BOT_TOKEN=8312031269:AAFto1ZfqRbj3e4mWYEBsV4KgaJ7GLGgVJ8
TELEGRAM_CHAT_ID=1229273513
```

---

## 12. Roadmap de Implementação

### Fase 1 — Infraestrutura base
- [ ] Tabelas: `ai_workflow_executions`, `ai_approvals`, `ai_audit_log`, `ai_ticket_suggestions`
- [ ] Models SQLAlchemy em `app/ai/models/`
- [ ] API routes: `GET/POST /ai/approvals`, `POST /approve`, `POST /reject`
- [ ] Frontend: `/admin/ai-approvals` com lista + modal de detalhe/aprovar/rejeitar
- [ ] Service `AIApprovalService`

### Fase 2 — Scheduler
- [ ] `AISchedulerService` com APScheduler (every 5 min)
- [ ] `TicketSelector` — queries de elegibilidade
- [ ] Advisory lock PostgreSQL
- [ ] Batching: limite 5 execuções concurrently

### Fase 3 — LangGraph Core
- [ ] `TicketAgentState` TypedDict
- [ ] Grafo: classify → check_approval → rag → suggest → finalize
- [ ] Checkpointer PostgreSQL
- [ ] `interrupt_before=["human_approval_handler"]`

### Fase 4 — Chains (MiniMax)
- [ ] Classification chain + output parser
- [ ] Response suggestion chain
- [ ] RAG chain com embeddings

### Fase 5 — MiniMax Agent (tools)
- [ ] Tools: get_ticket, update_ticket_field, save_suggestion, notify_agent
- [ ] Agent: SLA review + escalate
- [ ] Integration com workflow LangGraph

### Fase 6 — Human-in-the-Loop
- [ ] Interrupt + checkpoint storage
- [ ] Approval resume via API
- [ ] Notificações Telegram ao agente
- [ ] Frontend: painel de aprovação com diff da sugestão

### Fase 7 — RAG / Embeddings
- [ ] Embedding pipeline KB articles
- [ ] PGVector upsert
- [ ] Semantic search no rag_lookup

### Fase 8 — Observabilidade
- [ ] `ai_audit_log` em todos os nós
- [ ] Dashboard `/admin/ai-activity`
- [ ] Métricas: tempo médio, accuracy, aprovações pendentes

---

## 13. Regras Operacionais

| Regra | Valor |
|---|---|
| Intervalo scheduler | 5 minutos |
| Max execuções concurrently | 5 por scheduler run |
| Max retries por nó | 3 |
| TTL approval expirado | 24 horas |
| Batch size por run | 20 tickets |
| Threshold confiança baixa | < 0.70 → aprova sempre |
| Aprovação obrigatória | priority=urgent, intent=refund/legal |
| Timeout LLM call | 30 segundos |
| Timeout Groq agent | 60 segundos |

---

## 14. Auditoria e Compliance

Todas as ações de IA são logadas em `ai_audit_log`:

```json
{
  "action": "llm_called",
  "execution_id": "uuid",
  "ticket_id": "uuid",
  "node_name": "classify",
  "actor": "ai",
  "llm_model": "gpt-4.5-nano",
  "llm_prompt_tokens": 342,
  "llm_completion_tokens": 89,
  "latency_ms": 1243,
  "details": {
    "temperature": 0,
    "finish_reason": "stop"
  }
}
```

Dados sensíveis (conteúdo de tickets, nomes de clientes) são **omitidos**
ou hasheados nos logs de auditoria.
