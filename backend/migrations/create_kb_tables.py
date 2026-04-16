"""
Migração: Criar tabelas da Base de Conhecimento (KB)
Executar: docker exec <container> python3 /tmp/migration.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:97452c28f62db6d77be083917b698660@postgres_postgres:5432/atendimento_db"
)
engine = create_engine(DATABASE_URL)

def migrate():
    with engine.connect() as conn:
        tables = [
            # kb_categories
            """CREATE TABLE IF NOT EXISTS kb_categories (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(100) NOT NULL,
                description TEXT,
                parent_id UUID REFERENCES kb_categories(id),
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )""",
            # kb_tags
            """CREATE TABLE IF NOT EXISTS kb_tags (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(50) NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )""",
            # kb_articles
            """CREATE TABLE IF NOT EXISTS kb_articles (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                summary TEXT,
                category_id UUID REFERENCES kb_categories(id) ON DELETE SET NULL,
                status VARCHAR(20) DEFAULT 'draft',
                author_id UUID,
                views INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )""",
            # kb_article_tags
            """CREATE TABLE IF NOT EXISTS kb_article_tags (
                article_id UUID REFERENCES kb_articles(id) ON DELETE CASCADE,
                tag_id UUID REFERENCES kb_tags(id) ON DELETE CASCADE,
                PRIMARY KEY (article_id, tag_id)
            )""",
            # kb_attachments
            """CREATE TABLE IF NOT EXISTS kb_attachments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                article_id UUID REFERENCES kb_articles(id) ON DELETE CASCADE NOT NULL,
                filename VARCHAR(255) NOT NULL,
                original_name VARCHAR(255) NOT NULL,
                file_path VARCHAR(500) NOT NULL,
                mime_type VARCHAR(100),
                file_size INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )""",
        ]
        for sql in tables:
            try:
                conn.execute(text(sql))
                conn.commit()
                name = sql.split("\n")[0].replace("CREATE TABLE IF NOT EXISTS ", "").replace(" (", "")
                print(f"OK: {name}")
            except Exception as e:
                print(f"ERR: {e}")

        # Indexes
        indexes = [
            "CREATE INDEX IF NOT EXISTS idx_kb_articles_status ON kb_articles(status)",
            "CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON kb_articles(category_id)",
            "CREATE INDEX IF NOT EXISTS idx_kb_articles_author ON kb_articles(author_id)",
            "CREATE INDEX IF NOT EXISTS idx_kb_article_tags_tag ON kb_article_tags(tag_id)",
            "CREATE INDEX IF NOT EXISTS idx_kb_attachments_article ON kb_attachments(article_id)",
        ]
        for idx_sql in indexes:
            try:
                conn.execute(text(idx_sql))
                conn.commit()
                print(f"OK index: {idx_sql.split(' ')[5]}")
            except Exception as e:
                print(f"ERR idx: {e}")

        print("\nMigração KB concluída.")

if __name__ == "__main__":
    migrate()
