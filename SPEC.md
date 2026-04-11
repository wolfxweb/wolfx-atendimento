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

**Nota:** O SLA do cliente é encontrado pelo `SLA.customer_id`. Se não existir SLA para esse customer, usa o SLA global (is_default=True).

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

### SLA

Um único modelo que pode ser global (sem customer) ou customizado (com customer_id).

| Campo | Tipo | Validação |
|-------|------|-----------|
| id | UUID | PK |
| customer_id | UUID | FK → Customer, nullable, unique (se cliente) |
| name | String(100) | Not null |
| priority | String(20) | `low`, `normal`, `high`, `urgent` |
| first_response_minutes | Integer | Not null |
| resolution_minutes | Integer | Not null |
| business_hours_only | Boolean | Default True |
| business_start_hour | Integer | Default 9 |
| business_end_hour | Integer | Default 18 |
| business_days | JSON | Default [1,2,3,4,5] |
| is_active | Boolean | Default True |
| is_default | Boolean | Default False (SLA global é default) |
| created_at | DateTime | Auto |
| updated_at | DateTime | Auto |

**Funcionamento:**
- `customer_id = NULL` → SLA global (default do sistema)
- `customer_id = UUID` → SLA customizado desse cliente
- Se cliente não tiver SLA custom, usa o global (is_default=True)
- `is_default=True` identifica o SLA global

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
| GET | /api/v1/sla | Listar SLAs (global + do cliente logado) | Agent+ |
| POST | /api/v1/sla | Criar SLA customizado para cliente | Customer |
| GET | /api/v1/sla/{id} | Ver SLA específico | Yes |
| PATCH | /api/v1/sla/{id} | Editar SLA | Admin (global) / Owner (custom) |
| DELETE | /api/v1/sla/{id} | Apagar SLA customizado | Admin |
| GET | /api/v1/sla/global | Ver SLA global (default) | Agent+ |
| PATCH | /api/v1/sla/global | Editar SLA global | Admin |
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

## Telas / UI

### Visão Geral das Telas

| Tela | Roles | Descrição |
|------|-------|-----------|
| Login | Público | Autenticação |
| Registo | Público | Criar Customer + User |
| **Home (Customer)** | **Customer** | **Página inicial do cliente - mostra empresa** |
| Dashboard | Todos | Visão geral + stats |
| Tickets Lista | Todos | Listar + filtrar tickets |
| Ticket Detalhe | Todos | Ver + responder ticket |
| Novo Ticket | Customer | Criar ticket |
| Produtos Lista | Customer, Agent | Listar produtos |
| Produto Detalhe | Customer, Agent | Ver + editar produto |
| Categorias | Admin | Gerir categorias |
| Clientes | Admin, Agent | Gerir customers |
| SLA Dashboard | Agent+ | Ver status SLA |
| Configurações | Admin | Configurações gerais |
| Utilizadores | Admin | Gerir staff |

**Nota:** Todas as telas exceto Login e Registo requerem autenticação JWT.

---

## Telas Detalhadas

### 1. Login

| Campo | Tipo | Placeholder |
|-------|------|-------------|
| email | input email | "seu@email.com" |
| password | input password | "••••••••" |

**Botões:**
- [Entrar] - submit
- [Criar conta] - link para Registo

**Validações:**
- Email obrigatório e válido
- Password obrigatório (min 6 chars)

---

### 2. Registo (Criar Conta)

| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| Nome da Empresa | input text | Sim |
| CNPJ/CPF | input text | Não |
| Email | input email | Sim |
| Telefone | input tel | Não |
| Seu Nome | input text | Sim |
| Sua Senha | input password | Sim |
| Confirmar Senha | input password | Sim |

**Botões:**
- [Criar Conta] - submit

**Validações:**
- Email único no sistema
- Senha min 6 chars
- Senhas devem coincidir

---

### 3. Home do Cliente (Customer)

**Página inicial após login para Customers. Mostra info da empresa e atalhos rápidos.**

**Header:**
- Logo + Nome da Empresa
- Menu: Home | Tickets | Produtos | Definições
- Botão: Novo Ticket
- Avatar user: [Nome] ▼ (dropdown: Perfil, Sair)

**Corpo:**

| Secção | Conteúdo |
|--------|----------|
| Welcome | "Bem-vindo, [Nome do User]!" |
| Empresa | Card com info da empresa |
| Stats | 4 cards: Tickets Abertos, Produtos, Resolvidos, Em Atraso |
| Atalhos | Botões: Novo Ticket, Ver Tickets, Meus Produtos |
| Tickets Recentes | Lista últimos 5 tickets do customer |
| Produtos Recentes | Lista últimos 6 produtos |

**Card Info Empresa:**

| Campo | Descrição |
|-------|-----------|
| Nome | Razão social |
| CNPJ | Documento |
| Email | Email contacto |
| Telefone | Telefone |
| Endereço | Morada |
| Membro desde | Data de criação |

**Stats Cards:**

| Card | Ícone | Valor |
|------|-------|-------|
| Tickets Abertos | ticket | count |
| Meus Produtos | package | count |
| Resolvidos (este mês) | check-circle | count |
| Em Atraso | alert-triangle | count |

**Info SLA do Cliente:**

| Campo | Descrição |
|-------|-----------|
| Plano SLA | Nome do SLA ativo (Global ou Custom) |
| First Response | Tempo máximo para resposta |
| Resolution | Tempo máximo para resolução |

**ATALHOS - Botões grandes:**

| Botão | Ícone | Link |
|-------|-------|------|
| Novo Ticket | plus-circle | → /tickets/new |
| Ver Todos Tickets | list | → /tickets |
| Meus Produtos | package | → /products |
| Perfil | user | → /profile |

**Lista Tickets Recentes:**

| Coluna | Descrição |
|--------|-----------|
| ID | #short |
| Título | truncado |
| Status | Badge |
| Criado | Data relativa |

**Lista Produtos Recentes:**

| Coluna | Descrição |
|--------|-----------|
| Imagem | Thumbnail |
| Nome | Nome |
| SKU | Código |
| Categoria | Badge |

---

### 4. Dashboard (Agent+/Admin)

**Cards de Estatísticas (top):**

| Card | Descrição |
|------|-----------|
| Total de Tickets | Count de todos os tickets |
| Abertos | Count status=open |
| Pendentes | Count status=pending |
| Resolvidos | Count status=solved |
| Dentro do SLA | Count sla_status=within |
| Em Risco | Count sla_status=at_risk |
| Violados | Count sla_status=breached |

**Gráficos:**
- Tickets por Status (barras)
- Tickets por Prioridade (barras)
- Tickets por Categoria (pizza)
- Evolução de Tickets (linha - últimos 7 dias)

**Lista de Tickets Recentes (últimos 10)**

---

### 5. Lista de Tickets

**Filtros (sidebar ou top bar):**

| Filtro | Tipo | Valores |
|--------|------|---------|
| Pesquisar | text | Busca em title, description |
| Status | select multi | open, pending, solved, closed, reopened |
| Prioridade | select multi | low, normal, high, urgent |
| Categoria | select | Lista de categorias |
| Cliente | select | Lista de customers (Agent+可见) |
| Agente | select | Lista de agents |
| Produto | select | Lista de produtos do customer |
| SLA Status | select multi | within, at_risk, breached |
| Data de Criação | date range | from - to |
| Tags | select multi | Lista de tags |

**Colunas da Lista:**

| Coluna | Descrição |
|--------|-----------|
| ID | #ticket_id (curto) |
| Título | Título do ticket |
| Cliente | Nome do customer |
| Status | Badge colorido |
| Prioridade | Badge colorido |
| Categoria | Badge com cor |
| Agente | Nome do agent atribuido |
| SLA | Indicador colored |
| Criado | Data relativa (há 2h) |

**Ações por linha:**
- Ver detalhes (click na linha)
- Atribuir agente (Agent+)
- Mudar status (Agent+)

**Paginação:** 20 por página, sortable por data/criado

---

### 6. Detalhe do Ticket

**Header:**
- ID + Título
- Status badge
- Prioridade badge
- SLA status badge
- Cliente (nome + empresa)
- Criado em (data completa)

**Tabs:**
- Detalhes | Comentários | Histórico | Ficheiros

**Tab Detalhes:**

| Campo | Valor |
|-------|-------|
| Descrição | Texto completo |
| Categoria | Badge |
| Produto Associado | Link para produto |
| Fotos | Grid de thumbnails |
| Tags | Badges |
| Agente Atribuído | Nome ou "Não atribuido" |
| Resumo Resolução | Texto (se resolvido) |

**Tab Comentários:**
- Lista de comentários (mais antigo primeiro)
- Comentário novo (form)

**Form Novo Comentário (Agent+):**
| Campo | Tipo |
|-------|------|
| Texto | textarea |
| Visibilidade | radio: Público / Interno |
| Ficheiros | upload multiple |

**Botões de Ação (Agent+):**
- [Atribuir a Mim]
- [Mudar Prioridade] → dropdown
- [Mudar Status] → dropdown
- [Resolver Ticket] → abre modal

**Modal Resolver Ticket:**
| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| Resumo da Resolução | textarea | Sim |
| Notificar Cliente | checkbox | Sim (default) |

---

### 7. Novo Ticket (Customer)

**Form:**

| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| Título | input text (200) | Sim |
| Descrição | textarea | Sim |
| Prioridade | select | Sim (default: normal) |
| Categoria | select | Não |
| Produto | select | Não |
| Fotos | file upload (max 10) | Não |

**Preview das fotos uploadadas (thumbnails com X para remover)**

**Botões:**
- [Cancelar] - volta para lista
- [Criar Ticket] - submit

---

### 8. Lista de Produtos (Customer)

**Filtros:**

| Filtro | Tipo |
|--------|------|
| Pesquisar | text (name, sku) |
| Categoria | select |

**Colunas:**

| Coluna | Descrição |
|--------|-----------|
| SKU | Código do produto |
| Nome | Nome |
| Categoria | Badge colorido |
| Preço | Formatado (EUR) |
| Fotos | Thumbnail count |
| Tickets | Count de tickets associados |
| Ações | Editar, Ver |

---

### 9. Detalhe do Produto (Customer)

**Header:**
- Nome
- SKU
- Badge Categoria

**Info:**
| Campo | Descrição |
|-------|-----------|
| Descrição | Texto |
| Preço | Formatado |
| Categoria | Badge |
| Fotos | Grid de imagens |
| Data de Criação | Completa |

**Botões:**
- [Editar Produto]
- [Ver Tickets do Produto] → lista filtrada

---

### 10. Gerir Categorias (Admin)

**Lista de Categorias:**

| Coluna | Descrição |
|--------|-----------|
| Cor | Circle colored |
| Nome | Nome |
| Slug | Texto |
| Tipo | Badge: Product / Ticket |
| Ícone | Icone |
| Tickets/Produtos | Count |
| Ativo | Toggle |
| Ações | Editar, Apagar |

**Modal/Form Criar/Editar Categoria:**

| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| Nome | input text | Sim |
| Slug | input text (auto) | Sim |
| Tipo | radio: Product / Ticket | Sim |
| Descrição | textarea | Não |
| Cor | color picker | Sim |
| Ícone | select | Não |
| Ordem | number | Não |

---

### 11. SLA Dashboard (Agent+)

**Cards Top:**

| Card | Count | Cor |
|------|-------|-----|
| Dentro do SLA | X | verde |
| Em Risco | X | amarelo |
| Violados | X | vermelho |

**Filtros:**
- Período: Hoje, Esta Semana, Este Mês, Todos
- Prioridade: Todas, Low, Normal, High, Urgent

**Tabela Tickets SLA:**

| Coluna | Descrição |
|--------|-----------|
| ID | #ticket |
| Título | truncado |
| Cliente | Nome |
| Prioridade | Badge |
| Tempo Restante | "2h 30m" ou "Violado há 1h" |
| Status | Badge |
| Agent | Nome |

**Gráfico:**
- Timeline de SLAs (barras horizontais mostrando tempo restante)

---

### 12. Clientes / Empresas (Admin/Agent)

**Filtros:**

| Filtro | Tipo |
|--------|------|
| Pesquisar | text (name, document) |
| Ativo | select: Todos, Ativos, Inativos |

**Colunas:**

| Coluna | Descrição |
|--------|-----------|
| Nome | Nome da empresa |
| CNPJ | Documento |
| Email | Email contacto |
| Telefone | Telefone |
| Tickets | Count total |
| Abertos | Count status=open |
| Utilizadores | Count users |
| Criado em | Data |
| Ações | Ver, Editar |

---

### 13. Utilizadores / Staff (Admin)

**Lista de Utilizadores (staff - agents + admins):**

| Filtro | Tipo |
|--------|------|
| Pesquisar | text (name, email) |
| Role | select: Todos, Admin, Agent |
| Status | select: Todos, Ativo, Inativo |

**Colunas:**

| Coluna | Descrição |
|--------|-----------|
| Avatar | Initials |
| Nome | Nome |
| Email | Email |
| Role | Badge: Admin / Agent |
| Team | Nome ou "-" |
| Status | Badge: available, away, offline |
| Tickets | Count atribuições |
| Ações | Editar, Desativar |

---

## Componentes UI Reutilizáveis

### Badge de Status

| Status | Cor | Background | Texto |
|--------|-----|------------|-------|
| open | blue | #EBF5FF | #1D4ED8 |
| pending | yellow | #FEF9C3 | #854D0E |
| solved | green | #DCFCE7 | #166534 |
| closed | gray | #F3F4F6 | #374151 |
| reopened | orange | #FFEDD5 | #9A3412 |

### Badge de Prioridade

| Prioridade | Cor |
|------------|-----|
| low | gray |
| normal | blue |
| high | orange |
| urgent | red |

### Badge de SLA

| SLA | Cor |
|-----|-----|
| within | green |
| at_risk | yellow |
| breached | red |

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

## Deployment

### Infraestrutura

```
VPS: Docker Swarm + Portainer + Traefik
├── PostgreSQL: postgres_postgres.1 (port 5432)
├── Database: atendimento_db (a criar)
└── SSL: Let's Encrypt automático via Traefik
```

### Domínio

| URL | Servicio | Porta |
|-----|----------|-------|
| https://atendimento.wolfx.com.br | Frontend (React) | 3000 |
| https://atendimento.wolfx.com.br/api | Backend (FastAPI) | 8000 |

### Traefik Labels

```yaml
traefik.enable: "true"
traefik.http.routers.atendimento.rule: Host(`atendimento.wolfx.com.br`)
traefik.http.routers.atendimento.entrypoints: websecure
traefik.http.routers.atendimento.tls.certresolver: letsencryptresolver
traefik.http.services.atendimento.loadbalancer.server.port: 8000
```

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://postgres:{PASSWORD}@postgres_postgres.1.nna9eggrh1nvmhflrrbkxicu6:5432/atendimento_db

# JWT
SECRET_KEY=change-me-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# App
APP_NAME=wolfx-atendimento
DEBUG=false
CORS_ORIGINS=https://atendimento.wolfx.com.br

# Upload
UPLOAD_DIR=/app/uploads
MAX_UPLOAD_SIZE=10485760
```

### Docker Stack

```yaml
version: "3.8"
services:
  api:
    image: wolfxweb/atendimento-api:latest
    deploy:
      labels:
        traefik.enable: "true"
        traefik.http.routers.atendimento.rule: Host(`atendimento.wolfx.com.br`)
        traefik.http.routers.atendimento.entrypoints: websecure
        traefik.http.routers.atendimento.tls.certresolver: letsencryptresolver
        traefik.http.services.atendimento.loadbalancer.server.port: 8000
    environment:
      DATABASE_URL: postgresql://postgres:{PASS}@postgres_postgres.1:5432/atendimento_db
      SECRET_KEY: {SECRET}
    volumes:
      - uploads_data:/app/uploads

  frontend:
    image: wolfxweb/atendimento-frontend:latest
    deploy:
      labels:
        traefik.enable: "true"
        traefik.http.routers.atendimento-front.rule: Host(`atendimento.wolfx.com.br`) && PathPrefix(`/`)
        traefik.http.routers.atendimento-front.entrypoints: websecure
        traefik.http.routers.atendimento-front.tls.certresolver: letsencryptresolver
        traefik.http.services.atendimento-front.loadbalancer.server.port: 3000

volumes:
  uploads_data:
```

###seed Admin (criado na inicialização)

```python
# Super Admin do sistema
{
    "email": "admin@wolfx.com",
    "password": "Admin@123",  # mudar em produção
    "name": "Administrador",
    "role": "admin"
}
```

### Comandos Deploy

```bash
# Build e deploy
docker build -t wolfxweb/atendimento-api:latest ./backend
docker build -t wolfxweb/atendimento-frontend:latest ./frontend

# Push para registry (se necessário)
docker push wolfxweb/atendimento-api:latest
docker push wolfxweb/atendimento-frontend:latest

# Deploy no swarm
docker stack deploy -c docker-compose.yml wolfx-atendimento

# Ver logs
docker service logs wolfx-atendimento_api -f
docker service logs wolfx-atendimento_frontend -f
```

---

## Changelog

| Data | Alteração |
|------|-----------|
| 2026-04-11 | Criado projeto e SPEC.md |
| 2026-04-11 | Adicionado deployment (VPS + Docker Swarm + Traefik) |
