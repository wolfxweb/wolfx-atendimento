# WolfX Atendimento - Sistema de Tickets estilo Zendesk

## Visão Geral

Sistema de gestão de atendimento e suporte ao cliente com tickets, approval workflow, SLA e catálogo de produtos.

---

## Tech Stack

| Componente | Tecnologia |
|------------|------------|
| Backend | FastAPI (Python) |
| ORM | SQLAlchemy |
| DB Dev | SQLite (`atendimento.db`) |
| DB Prod | PostgreSQL |
| Frontend | React + TypeScript |
| Cache | Redis |
| Storage | Local (dev) / S3 (prod) |
| Auth | JWT |
| E2E Tests | Playwright |
| CI/CD | GitHub Actions |

---

## Instalação

```bash
# Backend
cd backend
pip install -r requirements.txt

# Development (SQLite)
export DATABASE_URL="sqlite:///./atendimento.db"
uvicorn app.main:app --reload

# Production (PostgreSQL)
export DATABASE_URL="postgresql://user:pass@localhost/atendimento"
docker-compose up -d
```

---

## Estrutura do Projeto

```
wolfx-atendimento/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app
│   │   ├── config.py            # Settings dev/prod
│   │   ├── database.py         # SQLAlchemy connection
│   │   ├── models/             # SQLAlchemy models
│   │   ├── schemas/            # Pydantic schemas
│   │   ├── api/routes/         # API endpoints
│   │   ├── core/               # Security, config
│   │   └── utils/              # Helpers (SLA, etc)
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── e2e/                # Playwright
│   ├── uploads/                # Fotos (dev)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── docker-compose.yml
└── frontend/                   # React app (v2)
```

---

## Modelos

### Customer

Entidade que representa uma empresa/cliente. Todos os Users, Products e Tickets pertencem a um Customer.

| Campo | Tipo | Validação |
|-------|------|-----------|
| id | UUID | PK |
| name | String(200) | Not null |
| document | String(50) | CNPJ/CPF (opcional) |
| phone | String(20) | Opcional |
| email | String(255) | Email de contacto |
| address | Text | Endereço (opcional) |
| is_active | Boolean | Default True |
| created_at | DateTime | Auto |
| updated_at | DateTime | Auto |

### User

Utilizadores pertencem a um Customer (empresa). Agents e Admins não pertencem a nenhum Customer.

| Campo | Tipo | Validação |
|-------|------|-----------|
| id | UUID | PK |
| customer_id | UUID | FK → Customer, nullable |
| email | String(255) | Unique, not null, email |
| password_hash | String(255) | BCrypt |
| name | String(100) | Not null |
| role | Enum | `admin`, `agent`, `customer` |
| phone | String(20) | Opcional |
| is_active | Boolean | Default True |
| created_at | DateTime | Auto |
| updated_at | DateTime | Auto |

**Nota:** Users com role=`customer` SEMPRE têm customer_id (pertencem a uma empresa).
Users com role=`agent` ou `admin` têm customer_id=NULL (são staff).

### Agent (User role=agent)

| Campo | Tipo | Validação |
|-------|------|-----------|
| user_id | UUID | FK → User, PK |
| team | String(50) | Opcional |
| status | Enum | `available`, `away`, `offline` |
| max_tickets | Integer | Default 10 |

### Category

Categorias para organizar Products e Tickets.

| Campo | Tipo | Validação |
|-------|------|-----------|
| id | UUID | PK |
| name | String(100) | Not null |
| slug | String(100) | Unique, not null |
| type | Enum | `product`, `ticket` |
| description | Text | Opcional |
| color | String(7) | Hex color (ex: `#FF5733`) |
| icon | String(50) | Icone (ex: `bug`, `wrench`) |
| is_active | Boolean | Default True |
| order | Integer | Order de exibição |
| created_at | DateTime | Auto |
| updated_at | DateTime | Auto |

**Exemplos de Categorias de Produtos:**
| name | slug | type | color | icon |
|------|------|------|-------|------|
| Eletrónicos | eletronicos | product | `#3B82F6` | `cpu` |
| Móveis | moveis | product | `#8B5CF6` | `sofa` |
| Roupas | roupas | product | `#EC4899` | `shirt` |
| Alimentação | alimentacao | product | `#10B981` | `apple` |

**Exemplos de Categorias de Tickets:**
| name | slug | type | color | icon |
|------|------|------|-------|------|
| Suporte | suporte | ticket | `#EF4444` | `question` |
| Garantia | garantia | ticket | `#F59E0B` | `shield` |
| Devolução | devolucao | ticket | `#8B5CF6` | `refresh` |
| Dúvida | duvida | ticket | `#3B82F6` | `help` |
| Elogio | elogio | ticket | `#10B981` | `star` |
| Sugestão | sugestao | ticket | `#EC4899` | `lightbulb` |

### Product

| Campo | Tipo | Validação |
|-------|------|-----------|
| id | UUID | PK |
| customer_id | UUID | FK → Customer, not null |
| category_id | UUID | FK → Category, nullable |
| name | String(200) | Not null |
| sku | String(50) | Unique, not null |
| description | Text | Opcional |
| images | JSON | Array de URLs/caminhos |
| price | Decimal(10,2) | Opcional |
| created_at | DateTime | Auto |
| updated_at | DateTime | Auto |

### Ticket

| Campo | Tipo | Validação |
|-------|------|-----------|
| id | UUID | PK |
| title | String(200) | Not null |
| description | Text | Not null |
| status | Enum | `open`, `pending`, `solved`, `closed`, `reopened` |
| priority | Enum | `low`, `normal`, `high`, `urgent` |
| customer_id | UUID | FK → Customer, not null |
| created_by | UUID | FK → User, not null (quem abriu) |
| agent_id | UUID | FK → User, nullable |
| product_id | UUID | FK → Product, nullable |
| category_id | UUID | FK → Category, nullable |
| photos | JSON | Array de URLs/caminhos |
| tags | JSON | Array de strings |
| sla_status | Enum | `within`, `at_risk`, `breached` |
| requires_approval | Boolean | Default True |
| approved_at | DateTime | Nullable |
| approved_by | UUID | FK → User, nullable |
| resolution_summary | Text | Nullable |
| created_at | DateTime | Auto |
| updated_at | DateTime | Auto |

### Comment

| Campo | Tipo | Validação |
|-------|------|-----------|
| id | UUID | PK |
| ticket_id | UUID | FK → Ticket, not null |
| author_id | UUID | FK → User, not null |
| body | Text | Not null |
| is_public | Boolean | Default True |
| created_at | DateTime | Auto |

### TicketApproval

| Campo | Tipo | Validação |
|-------|------|-----------|
| id | UUID | PK |
| ticket_id | UUID | FK → Ticket, not null |
| user_id | UUID | FK → User, not null (quem aprovou/rejeitou) |
| action | String(20) | `approved` ou `rejected` |
| comment | Text | Opcional (obrigatório se rejected) |
| created_at | DateTime | Auto |

### SLAConfig

| Campo | Tipo | Validação |
|-------|------|-----------|
| id | UUID | PK |
| priority | String(20) | Unique: `low`, `normal`, `high`, `urgent` |
| first_response_minutes | Integer | Not null |
| resolution_minutes | Integer | Not null |
| business_hours_only | Boolean | Default True |
| business_start_hour | Integer | Default 9 |
| business_end_hour | Integer | Default 18 |
| business_days | JSON | Default [1,2,3,4,5] |
| is_active | Boolean | Default True |

---

## Status Workflow

```
Cliente abre ticket
        │
        ▼
     OPEN ─────────────────────────────────┐
        │                                  │
        │ Agent atribui                     │
        │ Agent responde                   │
        │        │                         │
        │        ▼                         │
        │    PENDING ◄────────────────────┤
        │        │                         │
        │        │ Cliente responde        │
        │        ▼                         │
        └────► OPEN ───────────────────────┘
                   │
                   │ Agent marca "Resolved"
                   │ (requires_approval=True)
                   │ resolution_summary preenchido
                   ▼
              SOLVED
             ↙       ↘
   Cliente APPROVA    Cliente REJEITA
        │                  │
        ▼                  ▼
     CLOSED            REOPENED
                            │
                            ▼
                       (volta a OPEN/PENDING)
```

---

## SLA Defaults

| Priority | First Response | Resolution |
|----------|----------------|------------|
| Low | 8 horas | 48 horas |
| Normal | 4 horas | 24 horas |
| High | 1 hora | 8 horas |
| Urgent | 15 min | 4 horas |

---

## API Endpoints

### Auth

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| POST | /api/v1/auth/register | Registar customer + user | No |
| POST | /api/v1/auth/login | Login → JWT | No |
| POST | /api/v1/auth/refresh | Refresh token | No |
| GET | /api/v1/auth/me | Perfil logado | Yes |

### Customers

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| POST | /api/v1/customers | Criar customer (empresa) | No (publico) |
| GET | /api/v1/customers | Listar customers | Admin |
| GET | /api/v1/customers/{id} | Ver customer | Admin/Agent |
| PATCH | /api/v1/customers/{id} | Editar customer | Admin |
| DELETE | /api/v1/customers/{id} | Desativar customer | Admin |
| GET | /api/v1/customers/{id}/tickets | Tickets do customer | Owner |
| GET | /api/v1/customers/{id}/products | Produtos do customer | Owner |
| GET | /api/v1/customers/{id}/users | Users do customer | Owner |

### Users

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| GET | /api/v1/users | Listar users (staff) | Admin |
| GET | /api/v1/users/{id} | Ver user | Yes |
| PATCH | /api/v1/users/{id} | Editar user | Self/Admin |
| DELETE | /api/v1/users/{id} | Desativar user | Admin |
| POST | /api/v1/customers/{id}/users | Criar user para customer | Admin |
| GET | /api/v1/agents | Listar agents | Agent+ |

### Products

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| POST | /api/v1/products | Criar produto | Customer |
| GET | /api/v1/products | Listar produtos | Yes |
| GET | /api/v1/products/{id} | Ver produto | Yes |
| PATCH | /api/v1/products/{id} | Editar produto | Owner |
| DELETE | /api/v1/products/{id} | Apagar produto | Owner |
| POST | /api/v1/products/{id}/images | Upload imagem | Owner |
| DELETE | /api/v1/products/{id}/images/{name} | Remover imagem | Owner |

### Categories

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| POST | /api/v1/categories | Criar categoria | Admin |
| GET | /api/v1/categories | Listar categorias | Yes |
| GET | /api/v1/categories/product | Categorias de produtos | Yes |
| GET | /api/v1/categories/ticket | Categorias de tickets | Yes |
| GET | /api/v1/categories/{id} | Ver categoria | Yes |
| PATCH | /api/v1/categories/{id} | Editar categoria | Admin |
| DELETE | /api/v1/categories/{id} | Apagar categoria | Admin |

### Tickets

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| POST | /api/v1/tickets | Criar ticket | Customer |
| GET | /api/v1/tickets | Listar tickets | Filtra por role |
| GET | /api/v1/tickets/{id} | Ver ticket | Owner/Agent+ |
| PATCH | /api/v1/tickets/{id} | Editar ticket | Owner/Agent+ |
| DELETE | /api/v1/tickets/{id} | Apagar ticket | Admin |
| POST | /api/v1/tickets/{id}/photos | Upload foto | Owner/Agent+ |
| POST | /api/v1/tickets/{id}/comments | Adicionar comment | Owner/Agent+ |
| GET | /api/v1/tickets/{id}/comments | Listar comments | Owner/Agent+ |
| POST | /api/v1/tickets/{id}/approve | Aprovar resolução | Customer |
| POST | /api/v1/tickets/{id}/reject | Rejeitar resolução | Customer |
| GET | /api/v1/tickets/{id}/approvals | Histórico aprovações | Owner/Agent+ |

### SLA

| Método | Endpoint | Descrição | Auth |
|--------|----------|-----------|------|
| GET | /api/v1/sla/configs | Listar configs SLA | Agent+ |
| PATCH | /api/v1/sla/configs/{priority} | Atualizar SLA | Admin |
| GET | /api/v1/sla/dashboard | Dashboard SLA | Agent+ |
| GET | /api/v1/sla/tickets/at-risk | Tickets em risco | Agent+ |

---

## Filtros

### GET /tickets

| Parâmetro | Tipo | Exemplo |
|-----------|------|---------|
| status | equals | `?status=open` |
| priority | equals | `?priority=high` |
| customer_id | UUID | `?customer_id=...` |
| agent_id | UUID | `?agent_id=...` |
| product_id | UUID | `?product_id=...` |
| category_id | UUID | `?category_id=...` |
| sla_status | equals | `?sla_status=breached` |
| tags | contains | `?tags=urgente` |
| created_at_from | date | `?created_at_from=2024-01-01` |
| created_at_to | date | `?created_at_to=2024-12-31` |

### GET /products

| Parâmetro | Tipo | Exemplo |
|-----------|------|---------|
| customer_id | UUID | `?customer_id=...` |
| category_id | UUID | `?category_id=...` |
| sku | string | `?sku=ABC123` |
| name | contains | `?name=iphone` |

### GET /users

| Parâmetro | Tipo | Exemplo |
|-----------|------|---------|
| role | equals | `?role=agent` |
| is_active | boolean | `?is_active=true` |
| created_at_from | date | `?created_at_from=2024-01-01` |

---

## Paginação

Todos os endpoints de lista:

| Parâmetro | Default | Max |
|-----------|---------|-----|
| page | 1 | - |
| per_page | 20 | 100 |
| sort_by | created_at | - |
| order | desc | asc, desc |

Resposta:
```json
{
  "data": [...],
  "total": 150,
  "page": 1,
  "per_page": 20,
  "pages": 8
}
```

---

## Upload de Fotos

- Max tamanho: 10MB por ficheiro
- Formatos: jpg, png, webp
- Max por ticket: 10 fotos
- Max por produto: 10 imagens
- Storage dev: `./uploads/`
- Storage prod: S3/MinIO

---

## Códigos de Erro

| Code | Significado |
|------|-------------|
| 400 | Bad Request - validação falhou |
| 401 | Unauthorized - não autenticado |
| 403 | Forbidden - sem permissão |
| 404 | Not Found |
| 409 | Conflict - recurso já existe |
| 422 | Unprocessable Entity |
| 500 | Internal Server Error |

---

## Testes

### Unit Tests
- Password hash/verify
- JWT encode/decode
- Validação de schemas Pydantic
- Cálculo de SLA
- Validação de transições de status

### Integration Tests
- CRUD de todos os endpoints
- Autenticação e permissões
- Filtros e paginação
- Workflow de tickets

### E2E Tests (Playwright)
- Login flow completo
- Customer cria ticket com fotos
- Agent atribui e responde ticket
- Agent resolve ticket
- Cliente aprova resolução
- Dashboard SLA

---

## Issues / Tasks

| # | Task | Milestone | Status |
|---|------|-----------|--------|
| 1 | Setup inicial (FastAPI + SQLAlchemy) | M1 | TODO |
| 2 | Gestão de Tickets (CRUD + fotos) | M1 | TODO |
| 3 | Clientes e Agentes | M1 | TODO |
| 4 | Catálogo de Produtos + Fotos | M1 | TODO |
| 5 | Comentários e Conversação | M2 | TODO |
| 6 | SLA - Service Level Agreement | M2 | TODO |
| 7 | Aprovação de Ticket pelo Cliente | M2 | TODO |
| 8 | Dashboard e Estatísticas | M2 | TODO |
| 9 | CI/CD + E2E Tests | M3 | TODO |

---

## Configuração

### Environment Variables

```bash
# Database
DATABASE_URL=sqlite:///./atendimento.db

# JWT
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Upload
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE=10485760  # 10MB

# Optional (prod)
# REDIS_URL=redis://localhost:6379
# S3_BUCKET=wolfx-atendimento
# S3_ACCESS_KEY=...
# S3_SECRET_KEY=...
```

---

## Changelog

| Data | Alteração |
|------|-----------|
| 2026-04-11 | Criado projeto e SPEC.md |
