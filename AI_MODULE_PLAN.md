# Módulo de IA — wolfx-atendimento
## Plano Completo de Arquitetura e Implementação

---

## 1. Visão Geral

Sistema de IA para processamento automático de tickets do helpdesk, com
aprovação humana para ações críticas. O scheduler verifica tickets pendentes
a cada 5 minutos e acciona workflows LangGraph que usam LLM para
classificar, sugerir respostas, buscar artigos KB e escalar quando necessário.

**Modelo LLM:** OpenRouter — `google/gemini-2.0-flash-exp` (classificação, resposta sugerida, RAG)
**Endpoint:** `https://openrouter.ai/api/v1`
**Tool Calling:** NÃO USADO — Nós LangGraph chamam serviços Python directamente (sem LangChain)
**Arquitectura:** LangGraph (node-based) + OpenRouter (LLM) + APScheduler (scheduler)
**Traces:** LangFuse self-hosted em `https://langfuse.celx.com.br`
**Custo:** ~$0.00-0.01/1M tokens (tier gratuito com limites)

---

## 2. Arquitectura de Camadas — OpenRouter como Motor de LLM

> **PRINCÍPIO FUNDAMENTAL:** OpenRouter é apenas o "motor de inferência" — uma caixa preta
> que recebe texto e devolve texto. NÃO tem regras de negócio. Todas as decisões
> (quando pedir aprovação, a quem escalar, thresholds, etc.) são **código Python**.

```
┌──────────────────────────────────────────────────────────────────┐
│  CAMADA 1 — ORQUESTRAÇÃO (Python)                                │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  SCHEDULER (APScheduler — a cada 5 min)                    │  │
│  │  • Busca tickets elegíveis                                  │  │
│  │  • Dispara workflow via thread                              │  │
│  │  • Advisory lock PostgreSQL                                 │  │
│  └────────────────────────┬────────────────────────────────────┘  │
│                            │                                      │
│  ┌────────────────────────▼────────────────────────────────────┐  │
│  │  LANGGRAPH WORKFLOW ENGINE                                  │  │
│  │  • TicketAgentState (TypedDict) — estado partilhado         │  │
│  │  • PostgreSQL checkpointer (persistência entre-interrompções)│  │
│  │  • interrupt_before=["human_approval_handler"]              │  │
│  │  • Retry: máx 3 vezes por nó                               │  │
│  └────────────────────────┬────────────────────────────────────┘  │
└───────────────────────────│────────────────────────────────────────┘
                            │
┌───────────────────────────│────────────────────────────────────────┐
│  CAMADA 2 — NÓS DO GRAFO (Python = REGRAS DE NEGÓCIO)            │
│                            │                                      │
│  ┌─────────────────────────▼────────────────────────────────────┐ │
│  │  classify_node() — Python                                    │ │
│  │  1. Prepara prompt → OpenRouter                              │ │
│  │  2. Recebe classificação JSON                                 │ │
│  │  3. APLICA REGRAS: if confidence < 0.70 → needs_approval    │ │
│  │  4. Atualiza TicketAgentState                                │ │
│  └────────────────────────┬────────────────────────────────────┘  │
│                            │                                      │
│  ┌─────────────────────────▼────────────────────────────────────┐ │
│  │  check_approval_needed_node() — Python                        │ │
│  │  REGRAS: priority=urgent OR intent=refund → needs_approval   │ │
│  └────────────────────────┬────────────────────────────────────┘  │
│                            │                                      │
│  ┌─────────────────────────▼────────────────────────────────────┐ │
│  │  suggest_response_node() — Python                            │ │
│  │  1. Prepara prompt + KB articles → OpenRouter               │ │
│  │  2. Recebe resposta sugerida                                │ │
│  │  3. Se has_action=True → needs_approval                     │ │
│  │  4. Grava em ai_ticket_suggestions                          │ │
│  └────────────────────────┬────────────────────────────────────┘  │
│                            │                                      │
│  ┌─────────────────────────▼────────────────────────────────────┐ │
│  │  human_approval_handler() — Python                           │ │
│  │  1. Grava AIApproval no banco                               │ │
│  │  2. Notifica agentes via Telegram                            │ │
│  │  3. PAUSA (LangGraph interrupt) — aguarda decisão humana     │ │
│  │  4. Após decisão: resume workflow com human_decision         │ │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────│────────────────────────────────────────┘
                            │
┌───────────────────────────│────────────────────────────────────────┐
│  CAMADA 3 — LLM (OpenRouter = Motor, SEM REGRAS)                 │
│                            │                                      │
│  OpenRouter (google/gemini-2.0-flash-exp)                       │
│  • Classificação (chat completions básico)                       │
│  • Geração de resposta sugerida                                  │
│  • RAG embeddings: MiniMax (text-embedding-002)                   │
│                                                                   │
│  ⚠️ OpenRouter NÃO sabe:                                          │
│  • O que é um ticket, cliente, SLA                               │
│  • Quando pedir aprovação                                         │
│  • Quem é o agente responsável                                    │
│  • Thresholds de confiança                                        │
│  • Tool calling NÃO usado — nodes LangGraph chamam Python        │
│    serviços directamente (sem LangChain)                         │
└───────────────────────────────────────────────────────────────────┘
```

### 2.1 Separação de Responsabilidades

| Componente | Responsabilidade | Onde vive |
|---|---|---|
| **Scheduler** | Quando disparar (5 em 5 min) | `app/ai/scheduler/scheduler_service.py` |
| **Workflow (LangGraph)** | Orquestrar nós, persistir estado, pausar/resumir | `app/ai/workflows/ticket_agent.py` |
| **Nós (Python)** | Regras de negócio, interpretar resultados LLM, decidir próximos passos | `app/ai/workflows/nodes/*.py` |
| **Chains (prompts)** | Apenas transformar dados → prompt e prompt → struct | `app/ai/chains/*.py` |
| **OpenRouter (LLM)** | Apenas inferência: texto entra, texto sai |调用外部 API |
| **Tools (Python)** | Ações que o agente pode executar (notificar, gravar, etc.) | `app/ai/tools/*.py` |
| **Services** | Lógica de domínio: approval workflow, SLA, notificações | `app/services/*.py` |

### 2.2 Exemplo — Fluxo Completo de Classificação

```
1. Scheduler encontra ticket novo → dispatch
2. classify_node() é chamado (Python)
   ├─ Prepara prompt: "Classifica: título=X, descrição=Y"
   ├─ openrouter_llm.invoke(prompt)  ──► OpenRouter API
   │                                    ◄── {"priority": "high", "confidence": 0.65, ...}
   ├─ classification = response.parsed
   │
   ├─ REGRAS DE NEGÓCIO (Python):
   │   if classification["confidence"] < 0.70:
   │       state["needs_approval"] = True   ← NÃO é o LLM que decide!
   │   elif classification["intent"] == "refund":
   │       state["needs_approval"] = True
   │
   └─ state["classification"] = classification
      return state
```

> **OpenRouter** = motor. **Código Python** = cérebro que decide o que fazer com o resultado.

---

## 3. Diagrama de Estados — Ticket + IA

```
                    ┌─ novo ──────────────────────────────────┐
                    │                                          │
                    │  pendente_classificacao                  │
                    │  ┌──────────────────────────────────┐    │
                    │  │  IA classifica (OpenRouter)      │    │
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
                    │  │  IA revê SLA (OpenRouter agent)   │    │
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

Aprovações humanas pendentes e histórico. Todos os campos de monitoring
permitem avaliar a precisão da IA ao longo do tempo.

```sql
CREATE TABLE ai_approvals (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id     UUID NOT NULL REFERENCES ai_workflow_executions(id),
    ticket_id        UUID NOT NULL REFERENCES tickets(id),

    -- Identificação do pedido
    approval_type    VARCHAR(50) NOT NULL,
        -- 'classify_confirm'    — classificação de priority/intent crítica
        -- 'response_confirm'   — resposta com acção operacional
        -- 'escalate_confirm'   — escalonamento proposto
        -- 'close_confirm'      — fecho automático
        -- 'sla_override'        — override de SLA
    step_description TEXT NOT NULL,             -- "IA sugere: priority=urgent..."
    ai_suggestion    JSONB NOT NULL,           -- {priority, confidence, reason, ...}

    -- ── Monitoring / Avaliação ──────────────────────────────
    confidence       DECIMAL(5,4),             -- confiança AI no momento da sugestão
    ticket_priority  VARCHAR(20),             -- priority do ticket nesse momento
    ticket_category  VARCHAR(100),            -- category do ticket nesse momento
    auto_skipped     BOOLEAN DEFAULT FALSE,   -- TRUE se regra disparou (mesmo em dry_run)
    matched_rule_id  UUID REFERENCES ai_approval_rules(id),
                                                -- qual regra fez match (pode ser NULL)
    dry_run          BOOLEAN DEFAULT TRUE,   -- TRUE = era dry_run (só regista, não aprova)
    rule_action      VARCHAR(20),            -- acção da regra que disparou (auto_approve etc)

    -- Decisão humana
    human_decision   VARCHAR(20),              -- approved | rejected | expired | null
    human_notes      TEXT,
    approver_user_id UUID REFERENCES users(id),
    approved_at      TIMESTAMP,
    created_at       TIMESTAMP DEFAULT NOW(),
    expires_at       TIMESTAMP,               -- DEFAULT NOW() + 24 hours
    resume_checkpoint JSONB                  -- LangGraph checkpoint snapshot
);

CREATE INDEX idx_ai_appr_execution  ON ai_approvals(execution_id);
CREATE INDEX idx_ai_appr_pending   ON ai_approvals(created_at)
                                     WHERE human_decision IS NULL;
CREATE INDEX idx_ai_appr_ticket     ON ai_approvals(ticket_id);
CREATE INDEX idx_ai_appr_type       ON ai_approvals(approval_type);
CREATE INDEX idx_ai_appr_auto       ON ai_approvals(auto_skipped)
                                     WHERE auto_skipped = TRUE;
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
        -- 'agent_tool_called'   — OpenRouter agent executou tool
        -- 'approval_requested'  — pausa para aprovação humana
        -- 'approval_received'   — humano decidiu
        -- 'workflow_resumed'    — retomar após aprovação
        -- 'workflow_completed'  — terminou com sucesso
        -- 'workflow_failed'     — erro após retries
        -- 'retry'               — retry de nó
    node_name        VARCHAR(100),
    actor            VARCHAR(20) NOT NULL,      -- 'ai' | 'human' | 'system'
    details          JSONB,
    llm_model        VARCHAR(50),              -- 'google/gemini-2.0-flash-exp'
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

### 4.5 — `ai_embeddings` + Pipeline de PDF + Chunking KB

Embeddings dos artigos da Base de Conhecimento para RAG.
Suporta extração de texto de **PDFs anexados aos artigos KB**,
segmentação em chunks de ~500 caracteres, e pesquisa semântica.

**Fontes de conteúdo para embedding:**

| source_type | Origem | Exemplo |
|---|---|---|
| `article_body` | Corpo do artigo KB | texto do markdown |
| `article_attachment` | Anexo PDF do artigo KB | manual, documentação |
| `ticket_history` | Histórico de tickets passados | tickets resolvidos similares |

**Pipeline de indexing (quando artigo KB é criado/atualizado):**

```
1. Extrair texto do corpo do artigo (markdown → plain text)
2. Para cada anexo PDF:
     a) Baixar ficheiro de /tmp/kb_uploads/
     b) Extrair texto com PyPDF2 / pdfplumber
     c) Chunkar em segmentos de ~500 caracteres (overlap 50 chars)
     d) Para cada chunk: gerar embedding OpenRouter
     e) Guardar em ai_embeddings com source_type e metadata
3. Eliminar chunks órfãos do artigo (que já não existem)
```

**Extensão da tabela `ai_embeddings`:**

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE ai_embeddings (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id       UUID NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
    source_type      VARCHAR(30) NOT NULL,
        -- 'article_body' | 'article_attachment' | 'ticket_history'
    source_id        UUID,                        -- attachment_id se for PDF
    chunk_index      INTEGER NOT NULL,
    content_chunk    TEXT NOT NULL,               -- texto segmentado
    embedding        VECTOR(1024),                -- OpenRouter embeddings (dim=1024)
    metadata         JSONB,                       -- {page, filename, char_count}
    created_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_emb_article  ON ai_embeddings(article_id);
CREATE INDEX idx_emb_source  ON ai_embeddings(article_id, source_type);
CREATE INDEX idx_emb_cosine  ON ai_embeddings USING ivfflat
                               (embedding vector_cosine_ops)
                               WITH (lists = 100);
```

**Livrarias para extracção de PDF:**

```python
import pdfplumber       # extracção de texto com layout preservation
import pypdf            # alternativa mais leve

def extract_pdf_text(file_path: str) -> str:
    """Extrai texto completo de um PDF, página a página."""
    with pdfplumber.open(file_path) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages)

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """Segmenta texto em chunks com overlap."""
    chunks = []
    for i in range(0, len(text), chunk_size - overlap):
        chunk = text[i:i + chunk_size]
        if len(chunk) > 50:   # descartar chunks muito pequenos
            chunks.append(chunk.strip())
    return chunks
```

**Embedding com OpenRouter:**

```python
from langchain_openai import OpenAIEmbeddings

# Opção gratuita (dim=256) — Recomendada para custo zero
embeddings = OpenAIEmbeddings(
    model="Kazane/univoflabl/encoder_256",
    openai_api_key=OPENROUTER_API_KEY,
    openai_api_base="https://openrouter.ai/api/v1",
)
# NOTA: Kazane suporta apenas query (não batch). Para batch usar:
# EMBEDDINGS_MODEL=mixedbread/mxbai-embeddings-v1 (dim=1024)
```

**Pesquisa RAG (no workflow LangGraph):**

```python
def rag_lookup(query: str, article_ids: list[str] = None, top_k: int = 5):
    """
    1. Gera embedding da query com OpenRouter
    2. Busca top_k chunks mais similares (cosine similarity)
    3. Se article_ids: filtra só chunks desses artigos
    4. Retorna chunks + score de similaridade
    """
    query_embedding = embeddings.embed_query(query)

    sql = """
        SELECT content_chunk, article_id, source_type,
               1 - (embedding <=> %s::vector) AS similarity
        FROM ai_embeddings
        WHERE (%s::uuid[] IS NULL OR article_id = ANY(%s::uuid[]))
          AND source_type IN ('article_body', 'article_attachment')
        ORDER BY embedding <=> %s::vector
        LIMIT %s
    """
    results = db.execute(sql, [query_embedding, article_ids, article_ids,
                                query_embedding, top_k])
    return [dict(row) for row in results]
```


### 4.7 — `ai_approval_feedback` — Avaliação Post-Hoc

Avaliação granular de cada decisão de aprovação. Permite ao supervisor
classificar se a IA estava correcta, semi-correcta ou errada — criando
um ciclo de feedback para ajustar os limiares de auto-aprovação.

```sql
CREATE TABLE ai_approval_feedback (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_id      UUID NOT NULL REFERENCES ai_approvals(id),

    -- Avaliação do supervisor
    ai_correct       VARCHAR(20) NOT NULL,
        -- 'correct'       — IA acertou na sugestão
        -- 'partial'       — parcialmente correcto (aprovou com mods)
        -- 'wrong'         — IA sugeriu algo inadequado
        -- 'unnecessary'  — não precisava de aprovação (auto-era)
    evaluator_id     UUID REFERENCES users(id),    -- quem avaliou
    evaluation_notes TEXT,
    evaluated_at     TIMESTAMP DEFAULT NOW(),

    -- Dados preservados para análise
    -- (cópia do estado no momento — não altera mesmo que ticket mude)
    suggestion_snapshot JSONB,    -- ai_suggestion na altura
    ticket_snapshot     JSONB,    -- ticket data na altura
    resolution_time_minutes INTEGER,  -- tempo desde criação do ticket
    created_at        TIMESTAMP DEFAULT NOW(),

    UNIQUE(approval_id)   -- só uma avaliação por aprovação
);

CREATE INDEX idx_ai_fb_approval  ON ai_approval_feedback(approval_id);
CREATE INDEX idx_ai_fb_correct  ON ai_approval_feedback(ai_correct);
CREATE INDEX idx_ai_fb_evaluator ON ai_approval_feedback(evaluator_id);
```

### 4.8 — `ai_approval_metrics` — Métricas Agregadas

Métricas agregadas por tipo de aprovação. Actualizadasperiodicamente
(pode ser uma view SQL ou uma scheduled task).

```sql
CREATE TABLE ai_approval_metrics (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_start     TIMESTAMP NOT NULL,        -- início do período (dia/semana)
    period_end       TIMESTAMP NOT NULL,        -- fim do período
    granularity      VARCHAR(10) NOT NULL,      -- 'daily' | 'weekly' | 'monthly'

    -- Dimensões
    approval_type    VARCHAR(50) NOT NULL,     -- classify_confirm, response_confirm...
    ticket_priority  VARCHAR(20),              -- low, normal, high, urgent, ALL
    ticket_category  VARCHAR(100),             -- categoria ou ALL

    -- Métricas
    total_count      INTEGER DEFAULT 0,
    approved_count   INTEGER DEFAULT 0,
    rejected_count   INTEGER DEFAULT 0,
    expired_count    INTEGER DEFAULT 0,
    auto_skipped_count INTEGER DEFAULT 0,

    approval_rate    DECIMAL(5,4) GENERATED ALWAYS AS
                     (CASE WHEN total_count > 0
                      THEN approved_count::decimal / total_count
                      ELSE 0 END) STORED,

    avg_confidence   DECIMAL(5,4),
    avg_resolution_minutes INTEGER,

    -- Feedback post-hoc (quando existir)
    correct_count    INTEGER DEFAULT 0,
    partial_count    INTEGER DEFAULT 0,
    wrong_count      INTEGER DEFAULT 0,
    ai_accuracy      DECIMAL(5,4) GENERATED ALWAYS AS
                     (CASE WHEN (correct_count + wrong_count) > 0
                      THEN correct_count::decimal
                           / (correct_count + wrong_count)
                      ELSE 0 END) STORED,

    -- Meta: limiar actual dessa regra
    current_threshold DECIMAL(5,4),
    rule_enabled     BOOLEAN DEFAULT FALSE,

    updated_at       TIMESTAMP DEFAULT NOW(),

    UNIQUE(period_start, period_end, granularity,
            approval_type, ticket_priority, ticket_category)
);

CREATE INDEX idx_ai_met_type     ON ai_approval_metrics(approval_type);
CREATE INDEX idx_ai_met_period   ON ai_approval_metrics(period_start DESC);
CREATE INDEX idx_ai_met_accuracy ON ai_approval_metrics(ai_accuracy)
                                   WHERE ai_accuracy > 0;
```

### 4.9 — `ai_approval_rules` — Regras de Auto-Aprovação

Regras configuráveis que determinam quando skipar a aprovação humana
com base em confiança, tipo e priority. Podem ser ajustadas manualmente
ou geradas automaticamente com base nas métricas.

> ⚠️ **MODO MONITORIZAÇÃO (Fase actual):** O campo `dry_run = TRUE` por defeito.
> Isto significa que as regras **apenas reginam/metricam** — nunca auto-aprovam
> nem auto-rejeitam sozinhas. O `action` é gravado em `ai_approvals.auto_skipped`
> para fins de análise, mas a aprovação humana é **sempre requerida**.
> Quando `dry_run = FALSE`, a acção é realmente executada — mas isso só
> será activado numa fase posterior, após validação das métricas.

```sql
CREATE TABLE ai_approval_rules (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identificação
    name             VARCHAR(100) NOT NULL,    -- "Auto-aprov. classify high-conf"
    description      TEXT,

    -- Condições de match (TODAS têm de ser verdadeiras)
    approval_type    VARCHAR(50) NOT NULL,     -- classify_confirm, response_confirm...
    min_confidence   DECIMAL(5,4) DEFAULT 0.70, -- confiança mínima AI (0.00-1.00)
    ticket_priority  VARCHAR(20),             -- NULL = qualquer priority
    ticket_category  VARCHAR(100),            -- NULL = qualquer categoria
    intent           VARCHAR(50),             -- NULL = qualquer intent
    language         VARCHAR(10),             -- NULL = qualquer idioma

    -- Resultado da regra (SÓ É APLICADO SE dry_run = FALSE)
    action           VARCHAR(20) NOT NULL DEFAULT 'require_review',
        -- 'auto_approve'   — aplica sugestão sem pedir aprovação
        -- 'auto_reject'    — rejeita e marca como processado
        -- 'require_review' — obriga aprovação (overrides outras regras)

    -- Controlo
    is_active        BOOLEAN DEFAULT TRUE,
    is_system        BOOLEAN DEFAULT FALSE,   -- TRUE = gerada automaticamente
    dry_run          BOOLEAN DEFAULT TRUE,   -- TRUE = só regista, não executa
        -- ⚠️ EM FASE ACTUAL, SEMPRE dry_run = TRUE
        -- Quando dry_run=FALSE e is_active=TRUE, action é executada
    confidence_feedback_based BOOLEAN DEFAULT FALSE,
        -- TRUE se o limiar min_confidence foi ajustado
        -- automaticamente com base em ai_approval_feedback

    -- Metadados
    created_by       UUID REFERENCES users(id),
    created_at       TIMESTAMP DEFAULT NOW(),
    updated_at       TIMESTAMP DEFAULT NOW(),
    last_triggered_at TIMESTAMP,

    -- Notas de auditoria
    notes            TEXT,
    trigger_count    INTEGER DEFAULT 0        -- quantas vezes foi aplicada
);

CREATE INDEX idx_ai_rule_active  ON ai_approval_rules(is_active)
                                  WHERE is_active = TRUE;
CREATE INDEX idx_ai_rule_type   ON ai_approval_rules(approval_type);
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

> **IMPORTANTE:** Cada nó é **código Python** que pode invocar o OpenRouter (LLM).
> A coluna "Motor LLM" indica qual nó **faz chamada externa** ao OpenRouter.

| Nó | Descrição | Motor LLM | O que faz |
|---|---|---|---|
| `classify_node` | Classifica ticket | **google/gemini-2.0-flash-exp** | Prepara prompt → chama LLM → interpreta resultado JSON → aplica regras |
| `check_approval_needed` | Decide se precisa aprovação humana | — (Python only) | Avalia: confidence < 0.70, priority=urgent, intent=refund → needs_approval |
| `rag_lookup_node` | Busca artigos KB por similarity | **google/gemini-2.0-flash-exp** | Gera query de embedding → busca PGVector → retorna artigos |
| `suggest_response_node` | Gera resposta sugerida | **google/gemini-2.0-flash-exp** | Prepara prompt + KB context → chama LLM → parsing JSON |
| `sla_review_node` | Revê SLA e detecta breach/at-risk | — (Python only) | Calcula tempos SLA, verifica breach risk → decide se escalar |
| `escalate_node` | Escalona ticket para agente | **google/gemini-2.0-flash-exp** (tool) | Agent tool calling: notify_agent, update_ticket_field |
| `finalize_node` | Grava resultados no banco | — (Python only) | UPDATE ticket, INSERT ai_ticket_suggestions, UPDATE execution |
| `human_approval_handler` | Processa aprovação humana | — (Python only) | Grava AIApproval, notifica Telegram, PAUSA workflow |

### 5.2.1 Implementação Tipo de um Nó

```python
# app/ai/workflows/nodes/classify.py

from app.ai.chains.classification import classification_chain
from app.services.audit_service import log_audit

def classify_node(state: TicketAgentState) -> TicketAgentState:
    """
    Nó Python — classifica ticket usando OpenRouter como motor de LLM.
    Regras de negócio (threshold, condições de aprovação) são TODAS em Python.
    """
    ticket = state["ticket_data"]

    # 1. Preparar input para o LLM (Chain = prompt + parsing)
    classification_raw = classification_chain.invoke({
        "title": ticket["title"],
        "description": ticket["description"],
        "history": ticket.get("history", ""),
    })

    # 2. Interpolar resultado (JsonOutputParser → Pydantic model)
    classification = classification_raw.parsed

    # 3. REGRAS DE NEGÓCIO — Python decide, não o LLM
    needs_approval = False
    reasons = []

    if classification.confidence < 0.70:
        needs_approval = True
        reasons.append(f"confiança baixa ({classification.confidence})")

    if classification.intent in ["refund", "legal", "data_deletion"]:
        needs_approval = True
        reasons.append(f"intent sensível ({classification.intent})")

    if classification.priority == "urgent":
        needs_approval = True
        reasons.append("priority urgent")

    # 4. Log de auditoria
    log_audit(
        execution_id=state["execution_id"],
        action="node_exited",
        node_name="classify",
        details={"classification": classification.model_dump(), "needs_approval": needs_approval}
    )

    # 5. Atualizar estado (NÃO é o LLM que decide o próximo passo)
    state["classification"] = classification.model_dump()
    state["needs_approval"] = needs_approval
    state["approval_reasons"] = reasons
    state["pending_approval"] = needs_approval

    return state
```

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

### 6.1 Classification Chain (OpenRouter)

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

openrouter_llm = ChatOpenAI(
    model="google/gemini-2.0-flash-exp",
    openai_api_key=OPENROUTER_API_KEY,
    openai_api_base="https://openrouter.ai/api/v1",
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
    | openrouter_llm
    | JsonOutputParser(pydantic_object=ClassificationOutput)
)
```

### 6.2 Response Suggestion Chain (OpenRouter)

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
    | openrouter_llm
    | JsonOutputParser()
)
```

### 6.3 OpenRouter Agent com Tools (function calling) — NÃO USADO

> ⚠️ **DEPRECATED:** Esta secção describe um agente LangChain com tool calling.
> A implementação real **NÃO usa LangChain** — os nodes LangGraph chamam
> serviços Python directamente. Mantido apenas como referência histórica.

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

# ── Agent OpenRouter ────────────────────────────────────────────

# OpenRouter com tool calling (via langchain-openai + custom base)
openrouter_llm = ChatOpenAI(
    model="google/gemini-2.0-flash-exp",
    openai_api_key=OPENROUTER_API_KEY,
    openai_api_base="https://openrouter.ai/api/v1",
)

tools = [
    get_ticket, update_ticket_field, save_suggestion,
    notify_agent, escalate_ticket, search_kb, log_audit
]

agent = create_react_agent(llm=openrouter_llm, tools=tools)
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

# ── Monitoring & Avaliação ─────────────────────────────────────
GET    /api/v1/ai/feedback                      Lista avaliações (c/ filtros)
POST   /api/v1/ai/feedback/:approval_id         Criar avaliação post-hoc
GET    /api/v1/ai/feedback/:approval_id         Detalhe de uma avaliação
GET    /api/v1/ai/metrics                       Métricas agregadas (por tipo/período)
GET    /api/v1/ai/rules                         Lista regras de auto-aprovação
POST   /api/v1/ai/rules                         Criar regra
PATCH  /api/v1/ai/rules/:id                     Actualizar regra (threshold, active)
DELETE /api/v1/ai/rules/:id                     Remover regra
POST   /api/v1/ai/rules/:id/test                Testar regra (simular sem aplicar)
GET    /api/v1/ai/rules/suggest-threshold       Sugerir threshold com base em métricas
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
│       ├── sla_review.py      # Nó: revê SLA (OpenRouter agent)
│       ├── escalate.py        # Nó: escalona (OpenRouter agent tool)
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
│   ├── embed_service.py     # OpenRouter embeddings (Kazane ou mixedbread)
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
# OpenRouter — 100% das tarefas LLM
OPENROUTER_API_KEY=***       # Token OpenRouter
OPENROUTER_API_BASE=https://openrouter.ai/api/v1   # Endpoint fixo
OPENROUTER_MODEL=google/gemini-2.0-flash-exp       # Modelo principal

# Embeddings (OpenRouter — gratuito, dim=256)
EMBEDDINGS_MODEL=Kazane/univoflabl/encoder_256
# Alternativa: mixedbread/mxbai-embeddings-v1 (dim=1024)

# PostgreSQL (LangGraph checkpointer + vectores)
DATABASE_URL=postgresql://postgres:***@postgres_postgres:5432/atendimento_db

# Notificações
TELEGRAM_BOT_TOKEN=***
TELEGRAM_CHAT_ID=1229273513
```

---

## 12. Roadmap de Implementação

> **Estado: ✅ Implementado** — deploy completo em produção (2026-04-19)

### Fase 1 — Infraestrutura base ✅
- [x] Tabelas: `ai_workflow_executions`, `ai_approvals`, `ai_audit_log`, `ai_ticket_suggestions`
- [x] Models SQLAlchemy em `app/models/ai_models.py`
- [x] API routes: `GET/POST /ai/approvals`, `POST /approve`, `POST /reject`
- [x] Frontend: `/admin/ai-approvals` com lista + modal de detalhe/aprovar/rejeitar
- [x] Service `AIApprovalService` (integrado nos nodes)

### Fase 2 — Scheduler ✅
- [x] `AISchedulerService` com APScheduler (every 5 min)
- [x] `TicketSelector` — queries de elegibilidade
- [x] Advisory lock PostgreSQL
- [x] Batching: limite 5 execuções concurrently

### Fase 3 — LangGraph Core ✅
- [x] `TicketAgentState` TypedDict (`app/ai/workflows/states.py`)
- [x] Grafo: classify → check_approval → rag_lookup → suggest_response → sla_review → escalate → finalize + human_approval (8 nós)
- [x] Checkpointer PostgreSQL (`langgraph-checkpoint-postgres`)
- [x] `interrupt_before=["human_approval"]`

### Fase 4 — Chains (OpenRouter) ✅
- [x] Classification chain + output parser (`app/ai/chains/classification.py`)
- [x] Response suggestion chain (`app/ai/chains/suggestion.py`)
- [x] RAG chain com embeddings MiniMax (`app/ai/chains/rag.py`)

### Fase 5 — Ferramentas e Tracing ✅
- [x] LangFuse self-hosted (`https://langfuse.celx.com.br`) — tracing de todos os LLM calls
- [x] Nodes chamam serviços Python directamente (sem LangChain, sem tool calling)
- [x] Tools: `escalate_ticket_service`, `notify_telegram`, `log_audit` — chamadas directas

### Pendências

- [ ] Criar tabelas de checkpoint LangGraph na DB (`checkpoints`, `checkpoint_writes`)
- [ ] Variáveis de ambiente `WORKFLOW_ENABLED=true`, `LANGFUSE_*` no serviço de produção
- [ ] Verificar se `ai_embeddings` / pipeline RAG PDF está activo na produção

---

## 13. Plano de Ajuste — LangChain + LangGraph + LangFuse (Revisão)

> **Problema:** A implementação actual NÃO usa LangChain. As chains são funções Python
> custom que chamam `httpx` directamente. O LangFuse é chamado manualmente.
> Este plano corrige para usar o ecossistema LangChain correctamente.

### 13.1 Arquitectura Actual (Problemas)

```
[PROBLEMA] llm_service.py         → httpx custom (sem LangChain)
[PROBLEMA] langfuse_client.py     → lf.generation() manual (sem callback LangChain)
[PROBLEMA] chains/*.py            → funções Python com string prompts (sem LCEL)
[OK]       workflows/*.py           → LangGraph puro ✅
[OK]       scheduler/*.py          → APScheduler ✅
```

### 13.2 Arquitectura Pretendida

```
[OK]       LangGraph  → orchestration (já correcto, não muda)
[NOVO]     LangChain  → LLM wrapper + LCEL chains
[NOVO]     LangFuse   → callback handler automático (LangChain-native)
```

```
┌─────────────────────────────────────────────────────────────────┐
│  LangGraph Node (Python)                                        │
│    │                                                            │
│    ▼                                                            │
│  LCEL Chain (PromptTemplate | ChatOpenAI | JsonOutputParser)   │
│    │                                                            │
│    ▼                                                            │
│  ChatOpenAI (openrouter base_url)                              │
│    │  ↕                                                          │
│    │  LangFuse CallbackHandler (tracing automático)             │
│    │                                                            │
└─────────────────────────────────────────────────────────────────┘
```

### 13.3 Pacotes Necessários (requirements.txt)

```txt
# Adicionar:
langchain-openai>=0.2.0      # ChatOpenAI com OpenAI+OpenRouter compatibilidade
langchain-core>=0.3.0        # LCEL base (PromptTemplate, StrOutputParser, etc.)
langfuse>=2.8.0              # callback handler (já existe)

# Manter:
langgraph==0.2.60            # Workflow engine (não muda)
langgraph-checkpoint-postgres==2.0.0
APScheduler==3.10.4
httpx==0.25.2                # para embedding service (não muda)
pdfplumber==0.11.0
```

### 13.4 Ficheiros a Alterar

| Ficheiro | Mudança | Prioridade |
|---|---|---|
| `requirements.txt` | Adicionar `langchain-openai`, `langchain-core` | 🔴 Alta |
| `app/services/llm_service.py` | Substituir `httpx` por `ChatOpenAI` LangChain | 🔴 Alta |
| `app/services/langfuse_client.py` | Substituir `lf.generation()` por `CallbackHandler` | 🔴 Alta |
| `app/ai/chains/classification.py` | LCEL: `PromptTemplate \| ChatOpenAI \| JsonOutputParser` | 🔴 Alta |
| `app/ai/chains/suggestion.py` | LCEL: `PromptTemplate \| ChatOpenAI \| JsonOutputParser` | 🔴 Alta |
| `app/ai/chains/escalation.py` | LCEL: `PromptTemplate \| ChatOpenAI \| JsonOutputParser` | 🟡 Média |
| `app/ai/chains/rag.py` | LCEL: `PromptTemplate \| ChatOpenAI \| StrOutputParser` | 🟡 Média |
| `app/ai/workflows/nodes/classify.py` | Usar chain LCEL em vez de `llm.complete()` | 🔴 Alta |
| `app/ai/workflows/nodes/suggest_response.py` | Usar chain LCEL em vez de `llm.complete()` | 🔴 Alta |
| `app/ai/workflows/nodes/escalate.py` | Usar chain LCEL em vez de `llm.complete()` | 🟡 Média |
| `app/services/embedding_service.py` | Substituir `httpx` por LangChain embeddings | 🟡 Média |
| `app/ai/persistence/checkpointer.py` | Usar `langgraph.checkpoint.postgres` (já correcto) | 🟢 Baixa |

### 13.5 Detalhe das Alterações por Ficheiro

---

#### 13.5.1 `requirements.txt` — Adicionar LangChain

```diff
+ langchain-openai>=0.2.0
+ langchain-core>=0.3.0
```

---

#### 13.5.2 `app/services/llm_service.py` — Substituir httpx por ChatOpenAI

**Antes (problema):**
```python
import httpx
resp = self._client().post(url, headers=headers, json=payload)
```

**Depois (LangChain):**
```python
from langchain_openai import ChatOpenAI

class LLMService:
    def __init__(self, ...):
        self._llm = ChatOpenAI(
            model=self.model,
            api_key=self.api_key,
            base_url=f"{self.api_base}/v1",  # OpenRouter
            temperature=temperature,
            max_tokens=max_tokens,
        )

    def chat_complete(self, messages, ...):
        # LangChain usa messages como list of BaseMessage
        from langchain_core.messages import HumanMessage, SystemMessage
        lc_messages = [SystemMessage(content=m["content"]) if m["role"]=="system"
                      else HumanMessage(content=m["content"]) for m in messages]
        response = self._llm.invoke(lc_messages)
        return {"content": response.content, "usage": {}, "model": self.model}
```

**Manter compatibilidade:** O `LLMService` continua a existir como wrapper/fachada.
Os nodes continuam a chamar `llm.complete()` ou `llm.chat_complete()`.
Só a implementação interna muda de `httpx` para `ChatOpenAI`.

---

#### 13.5.3 `app/services/langfuse_client.py` — Callback LangChain

**Antes (problema):**
```python
# Tracing manual — não aparece no LangFuse como chain
trace_llm_call(operation="classify", model=llm.model, ...)
lf.generation(name=operation, model=model, input=input_text, ...)
```

**Depois (LangChain callback):**
```python
from langfuse.callback import CallbackHandler

# Criar handler uma vez (singleton)
def get_langfuse_callback():
    global _callback
    if _callback is None:
        _callback = CallbackHandler(
            host=os.getenv("LANGFUSE_HOST"),
            secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
            public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
        )
    return _callback

# Nos nodes, usar como callback na chain:
chain.invoke(
    {"title": title, "description": desc},
    config={"callbacks": [get_langfuse_callback()]}
)
```

**Resultado:** Cada `.invoke()` da chain LangChain é automaticamente
traceada no LangFuse com input, output, latency, tokens, model — sem código manual.

---

#### 13.5.4 `app/ai/chains/classification.py` — LCEL Chain

**Antes (problema):**
```python
def get_classification_prompt(title, description, history) -> str:
    # retorna string de prompt
    return f"Classifica o ticket...\nTítulo: {title}\n..."

response = llm.complete(prompt=prompt, system_prompt=system_prompt, ...)
parsed = extract_json(response)
```

**Depois (LCEL):**
```python
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel

class ClassificationOutput(BaseModel):
    priority: str
    category: str
    intent: str
    language: str
    summary: str
    confidence: float
    reason: str

# Definir chain LCEL
classification_chain = (
    PromptTemplate.from_template(
        "Classifica o ticket.\n\nTítulo: {title}\nDescrição: {description}\n"
        "Histórico: {history}\n\nResponde com JSON."
    )
    | ChatOpenAI(model=MODEL, temperature=0.2, max_tokens=512)
    | JsonOutputParser(pydantic_object=ClassificationOutput)
)

# Invocar
result = classification_chain.invoke(
    {"title": title, "description": description, "history": history},
    config={"callbacks": [get_langfuse_callback()]}
)
# result é já um dict com priority, category, intent, etc. — sem parse manual
```

---

#### 13.5.5 `app/ai/workflows/nodes/classify.py` — Usar LCEL

**Antes:**
```python
llm = get_llm_service(db)
response = llm.complete(prompt=prompt, system_prompt=system_prompt, ...)
parsed = extract_json(response)
trace_llm_call(operation="classify", ...)
```

**Depois:**
```python
from app.ai.chains.classification import classification_chain
from app.services.langfuse_client import get_langfuse_callback

result = classification_chain.invoke(
    {"title": title, "description": description, "history": history},
    config={"callbacks": [get_langfuse_callback()]}
)
# result já tem priority, category, intent, confidence, etc.
# LangFuse já traceou automaticamente
```

---

### 13.6 Ordem de Implementação

```
Passo 1 ──► requirements.txt
  │          + langchain-openai, langchain-core
  │
Passo 2 ──► llm_service.py
  │          Substituir httpx por ChatOpenAI (manter interface)
  │
Passo 3 ──► langfuse_client.py
  │          CallbackHandler em vez de lf.generation()
  │
Passo 4 ──► classification.py + classify_node
  │          LCEL chain + callback no invoke()
  │
Passo 5 ──► suggestion.py + suggest_response_node
  │          LCEL chain + callback no invoke()
  │
Passo 6 ──► escalation.py + escalate_node
  │          LCEL chain + callback no invoke()
  │
Passo 7 ──► embedding_service.py
  │          LangChain embeddings em vez de httpx
  │
Passo 8 ──► Build + deploy + testar
```

### 13.7 Notas Importantes

1. **LangGraph NÃO muda** — os nodes continuam a ser funções Python.
   Só o código dentro dos nodes que chama LLM é que muda.

2. **Manter `LLMService` como fachada** — os nodes chamam
   `get_llm_service(db).complete()` ou `chat_complete()`.
   A interface não muda; só a implementação interna.

3. **LangFuse callback é por-chain** — cada `chain.invoke(config={"callbacks": [handler]})`
   cria um trace automático. Não precisa de chamar `lf.generation()` manualmente.

4. **JsonOutputParser substitui `extract_json()`** — LCEL dá logo
   o objecto Pydantic parseado. `extract_json()` pode ser removido.

5. **OpenRouter é OpenAI-compatible** — `ChatOpenAI(model="google/gemini-2.0-flash-exp",
   base_url="https://openrouter.ai/api/v1")` funciona sem changes ao modelo.

---

### 13.8 Verbose — diff mínimo por ficheiro

```diff
# requirements.txt
+ langchain-openai>=0.2.0
+ langchain-core>=0.3.0

# llm_service.py
- import httpx
- resp = self._client().post(url, ...)
+ from langchain_openai import ChatOpenAI
+ self._llm = ChatOpenAI(model=..., base_url=..., api_key=...)
+ response = self._llm.invoke(messages)

# langfuse_client.py
- lf.generation(name=op, model=m, input=inp, output=out, usage=u)
+ return CallbackHandler(host=..., secret_key=..., public_key=...)

# classification.py
- def get_classification_prompt(...): return f"..." # string
+ classification_chain = PromptTemplate | ChatOpenAI | JsonOutputParser
+ def get_classification_chain(): return classification_chain

# classify.py (node)
- response = llm.complete(prompt=...)
- parsed = extract_json(response)
- trace_llm_call(...)
+ result = classification_chain.invoke(vars, config={"callbacks": [handler]})
+ # result = {priority, category, intent, confidence, ...}
```

---

> **Compromisso:** Etapa 1-3 (requirements + llm_service + langfuse) é ~1h de trabalho.
> Etapa 4-5 (classification + suggestion LCEL) é ~2h.
> Etapa 6-7 (escalation + embeddings) é ~1h.
> Total estimado: ~4-5h de trabalho.