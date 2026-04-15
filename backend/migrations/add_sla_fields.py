"""
Migração: Adicionar campos SLA aos tickets e categoria aos SLAs
Executar: python -m migrations.add_sla_fields
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import engine, Base
from sqlalchemy import text


def migrate():
    with engine.connect() as conn:
        # 1. Adicionar category_id à tabela slas (nullable, sem constraint ainda)
        try:
            conn.execute(text("ALTER TABLE slas ADD COLUMN category_id UUID REFERENCES categories(id)"))
            conn.commit()
            print("✓ category_id added to slas")
        except Exception as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                print("- category_id already exists in slas (skip)")
            else:
                print(f"! category_id: {e}")

        # 2. Adicionar sla_id, sla_response_limit, sla_resolution_limit, first_response_at aos tickets
        new_columns = [
            ("sla_id", "UUID REFERENCES slas(id)"),
            ("sla_response_limit", "TIMESTAMP"),
            ("sla_resolution_limit", "TIMESTAMP"),
            ("first_response_at", "TIMESTAMP"),
        ]
        for col_name, col_type in new_columns:
            try:
                conn.execute(text(f"ALTER TABLE tickets ADD COLUMN {col_name} {col_type}"))
                conn.commit()
                print(f"✓ {col_name} added to tickets")
            except Exception as e:
                if "already exists" in str(e).lower() or "duplicate column" in str(e).lower():
                    print(f"- {col_name} already exists in tickets (skip)")
                else:
                    print(f"! {col_name}: {e}")

        # 3. Remover unique constraint antiga de customer_id em slas (se existir)
        try:
            conn.execute(text("ALTER TABLE slas DROP CONSTRAINT IF EXISTS slas_customer_id_key"))
            conn.commit()
            print("✓ Removed old unique constraint on slas.customer_id")
        except Exception as e:
            print(f"! Remove old constraint: {e}")

        # 4. Criar unique constraint composto (customer_id, priority, category_id)
        try:
            conn.execute(text("""
                ALTER TABLE slas
                ADD CONSTRAINT uq_sla_customer_priority_category
                UNIQUE (customer_id, priority, category_id)
            """))
            conn.commit()
            print("✓ Created unique constraint uq_sla_customer_priority_category")
        except Exception as e:
            if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                print("- Unique constraint already exists (skip)")
            else:
                print(f"! Create unique constraint: {e}")

    print("\nMigração concluída.")


if __name__ == "__main__":
    migrate()
