"""
AI Module Phase 1 - Criar tabelas de AI approval/monitoring
Executar: docker exec <container> python /tmp/create_ai_tables.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:***@postgres_postgres:5432/atendimento_db"
)
engine = create_engine(DATABASE_URL, isolation_level="AUTOCOMMIT")


def migrate():
    with engine.connect() as conn:
        # Ensure uuid-ossp extension (without pg_catalog schema prefix)
        try:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS uuid-ossp"))
            print("OK: uuid-ossp extension")
        except Exception as e:
            print(f"! uuid-ossp: {e}")

    # Use separate connections per table to avoid transaction abortion
    for sql in tables:
        with engine.connect() as conn:
            try:
                conn.execute(text(sql))
                conn.commit()
                name = sql.strip().split("\n")[0].replace("CREATE TABLE IF NOT EXISTS ", "").replace(" (", "")
                print(f"OK: {name}")
            except Exception as e:
                print(f"ERR: {e}")

    for idx_sql in indexes:
        with engine.connect() as conn:
            try:
                conn.execute(text(idx_sql))
                conn.commit()
                print(f"OK index: {idx_sql.split(' ')[4]}")
            except Exception as e:
                print(f"ERR idx: {e}")

    print("\nAI Module Phase 1 migration concluída.")


tables = [
    # 4.1 ai_workflow_executions
    """CREATE TABLE IF NOT EXISTS ai_workflow_executions (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id        UUID NOT NULL REFERENCES tickets(id),
        workflow_name    VARCHAR(100) NOT NULL DEFAULT 'ticket_ai_assistant',
        status           VARCHAR(30) NOT NULL DEFAULT 'pending',
        current_node     VARCHAR(50),
        payload          JSONB,
        result           JSONB,
        error            TEXT,
        thread_id        VARCHAR(255),
        interrupted_at   TIMESTAMP,
        interrupted_state JSONB,
        latency_ms       INTEGER,
        llm_model        VARCHAR(50) DEFAULT 'MiniMax-Text-01',
        started_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        finished_at      TIMESTAMP,
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",

    # 4.2 ai_approvals
    """CREATE TABLE IF NOT EXISTS ai_approvals (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        execution_id     UUID NOT NULL REFERENCES ai_workflow_executions(id),
        ticket_id        UUID NOT NULL REFERENCES tickets(id),
        approval_type    VARCHAR(50) NOT NULL,
        step_description TEXT NOT NULL,
        ai_suggestion    JSONB NOT NULL,
        confidence       DECIMAL(5,4),
        ticket_priority  VARCHAR(20),
        ticket_category  VARCHAR(100),
        auto_skipped     BOOLEAN DEFAULT FALSE,
        matched_rule_id  UUID,
        dry_run          BOOLEAN DEFAULT TRUE,
        rule_action      VARCHAR(20),
        human_decision   VARCHAR(20),
        human_notes      TEXT,
        approver_user_id UUID REFERENCES users(id),
        approved_at      TIMESTAMP,
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at       TIMESTAMP,
        resume_checkpoint JSONB
    )""",

    # 4.3 ai_audit_log
    """CREATE TABLE IF NOT EXISTS ai_audit_log (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        execution_id UUID REFERENCES ai_workflow_executions(id),
        node_name    VARCHAR(50) NOT NULL,
        action       VARCHAR(100) NOT NULL,
        actor        VARCHAR(20) NOT NULL,
        details      JSONB,
        llm_model    VARCHAR(50),
        latency_ms   INTEGER,
        token_count  INTEGER,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",

    # 4.4 ai_ticket_suggestions
    """CREATE TABLE IF NOT EXISTS ai_ticket_suggestions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id       UUID NOT NULL REFERENCES tickets(id),
        execution_id    UUID REFERENCES ai_workflow_executions(id),
        suggestion_type VARCHAR(50) NOT NULL,
        suggestion      JSONB NOT NULL,
        confidence      DECIMAL(5,4),
        applied         BOOLEAN DEFAULT FALSE,
        applied_by      UUID REFERENCES users(id),
        applied_at      TIMESTAMP,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",

    # 4.6 ai_approval_feedback
    """CREATE TABLE IF NOT EXISTS ai_approval_feedback (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        approval_id            UUID NOT NULL REFERENCES ai_approvals(id) UNIQUE,
        ai_correct            VARCHAR(20) NOT NULL,
        evaluator_id          UUID REFERENCES users(id),
        evaluation_notes      TEXT,
        evaluated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        suggestion_snapshot    JSONB,
        ticket_snapshot        JSONB,
        resolution_time_minutes INTEGER,
        created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""",

    # 4.7 ai_approval_metrics
    """CREATE TABLE IF NOT EXISTS ai_approval_metrics (
        id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        period_start           TIMESTAMP NOT NULL,
        period_end             TIMESTAMP NOT NULL,
        granularity            VARCHAR(10) NOT NULL,
        approval_type          VARCHAR(50) NOT NULL,
        ticket_priority        VARCHAR(20),
        ticket_category        VARCHAR(100),
        total_count            INTEGER DEFAULT 0,
        approved_count          INTEGER DEFAULT 0,
        rejected_count          INTEGER DEFAULT 0,
        expired_count           INTEGER DEFAULT 0,
        auto_skipped_count      INTEGER DEFAULT 0,
        avg_confidence          DECIMAL(5,4),
        avg_resolution_minutes  INTEGER,
        correct_count           INTEGER DEFAULT 0,
        partial_count           INTEGER DEFAULT 0,
        wrong_count             INTEGER DEFAULT 0,
        current_threshold       DECIMAL(5,4),
        rule_enabled            BOOLEAN DEFAULT FALSE,
        updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(period_start, period_end, granularity, approval_type, ticket_priority, ticket_category)
    )""",

    # 4.9 ai_approval_rules
    """CREATE TABLE IF NOT EXISTS ai_approval_rules (
        id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name                      VARCHAR(100) NOT NULL,
        description               TEXT,
        approval_type             VARCHAR(50) NOT NULL,
        min_confidence            DECIMAL(5,4) DEFAULT 0.70,
        ticket_priority           VARCHAR(20),
        ticket_category           VARCHAR(100),
        intent                    VARCHAR(50),
        language                  VARCHAR(10),
        action                    VARCHAR(20) NOT NULL DEFAULT 'require_review',
        is_active                 BOOLEAN DEFAULT TRUE,
        is_system                 BOOLEAN DEFAULT FALSE,
        dry_run                   BOOLEAN DEFAULT TRUE,
        confidence_feedback_based BOOLEAN DEFAULT FALSE,
        created_by                UUID REFERENCES users(id),
        created_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_triggered_at         TIMESTAMP,
        notes                     TEXT,
        trigger_count             INTEGER DEFAULT 0
    )""",
]

indexes = [
    "CREATE INDEX IF NOT EXISTS idx_exec_ticket ON ai_workflow_executions(ticket_id)",
    "CREATE INDEX IF NOT EXISTS idx_exec_status ON ai_workflow_executions(status)",
    "CREATE INDEX IF NOT EXISTS idx_exec_thread ON ai_workflow_executions(thread_id)",
    "CREATE INDEX IF NOT EXISTS idx_appr_exec ON ai_approvals(execution_id)",
    "CREATE INDEX IF NOT EXISTS idx_appr_ticket ON ai_approvals(ticket_id)",
    "CREATE INDEX IF NOT EXISTS idx_appr_type ON ai_approvals(approval_type)",
    "CREATE INDEX IF NOT EXISTS idx_appr_auto ON ai_approvals(auto_skipped) WHERE auto_skipped = TRUE",
    "CREATE INDEX IF NOT EXISTS idx_audit_exec ON ai_audit_log(execution_id)",
    "CREATE INDEX IF NOT EXISTS idx_audit_ts ON ai_audit_log(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_sug_ticket ON ai_ticket_suggestions(ticket_id)",
    "CREATE INDEX IF NOT EXISTS idx_sug_applied ON ai_ticket_suggestions(applied) WHERE applied = TRUE",
    "CREATE INDEX IF NOT EXISTS idx_fb_approval ON ai_approval_feedback(approval_id)",
    "CREATE INDEX IF NOT EXISTS idx_fb_correct ON ai_approval_feedback(ai_correct)",
    "CREATE INDEX IF NOT EXISTS idx_met_type ON ai_approval_metrics(approval_type)",
    "CREATE INDEX IF NOT EXISTS idx_met_period ON ai_approval_metrics(period_start DESC)",
    "CREATE INDEX IF NOT EXISTS idx_rule_active ON ai_approval_rules(is_active) WHERE is_active = TRUE",
    "CREATE INDEX IF NOT EXISTS idx_rule_type ON ai_approval_rules(approval_type)",
]


if __name__ == "__main__":
    migrate()