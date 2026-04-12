# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tickets.spec.ts >> Complete ticket lifecycle
- Location: tests/e2e/tickets.spec.ts:22:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('text=Abrir Novo Ticket')

```

# Page snapshot

```yaml
- generic [ref=e5]:
  - generic [ref=e6]:
    - heading "wolfx.atendimento" [level=1] [ref=e7]
    - paragraph [ref=e8]: Sistema de Tickets & Suporte
  - generic [ref=e9]:
    - generic [ref=e10]: Login failed. Check credentials.
    - generic [ref=e11]:
      - generic [ref=e12]: Email
      - textbox "seu@email.com" [ref=e13]: cliente2@wolfx.com
    - generic [ref=e14]:
      - generic [ref=e15]: Password
      - textbox "••••••••" [ref=e16]: Cliente@123
    - button "Entrar" [ref=e17]
  - generic [ref=e18]:
    - paragraph [ref=e19]: "Contas de teste:"
    - paragraph [ref=e20]: "Admin: admin@wolfx.com / Admin@123"
    - paragraph [ref=e21]: "Cliente: cliente2@wolfx.com / Cliente@123"
    - paragraph [ref=e22]: "Agente: joao.agente@wolfx.com / Agente@123"
```

# Test source

```ts
  1  | import { test, expect, Page } from '@playwright/test';
  2  | 
  3  | const BASE = 'https://atendimento.wolfx.com.br';
  4  | 
  5  | /**
  6  |  * Full ticket lifecycle E2E test:
  7  |  * 1. Customer creates a ticket
  8  |  * 2. Admin assigns to agent
  9  |  * 3. Agent resolves ticket
  10 |  * 4. Customer approves via API (Telegram button interaction simulated)
  11 |  */
  12 | test.beforeEach(async ({ page }) => {
  13 |   // Clear all storage before each test to avoid state pollution
  14 |   await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  15 |   await page.evaluate(() => {
  16 |     localStorage.clear();
  17 |     sessionStorage.clear();
  18 |   });
  19 |   await page.reload({ waitUntil: 'domcontentloaded' });
  20 | });
  21 | 
  22 | test('Complete ticket lifecycle', async ({ page }) => {
  23 |   const timestamp = Date.now();
  24 |   const ticketTitle = `E2E Ticket ${timestamp}`;
  25 |   const ticketDescription = 'Teste automatizado end-to-end via Playwright';
  26 | 
  27 |   // ── 1. CUSTOMER: Login ──────────────────────────────────────
  28 |   await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  29 |   await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  30 |   await page.fill('input[type="email"]', 'cliente2@wolfx.com');
  31 |   await page.fill('input[type="password"]', 'Cliente@123');
  32 |   await page.click('button[type="submit"]');
  33 |   await page.waitForTimeout(2000);
  34 | 
  35 |   const customerDashboard = page.locator('text=Tickets').or(page.locator('text=Dashboard'));
  36 |   await expect(customerDashboard.first()).toBeVisible({ timeout: 10000 });
  37 |   console.log('✅ Customer logged in');
  38 | 
  39 |   // ── 2. CUSTOMER: Click "Abrir Novo Ticket" from Dashboard ──
  40 |   const novoTicketBtn = page.locator('text=Abrir Novo Ticket');
> 41 |   await novoTicketBtn.click();
     |                       ^ Error: locator.click: Test timeout of 30000ms exceeded.
  42 |   await page.waitForTimeout(1000);
  43 |   console.log('✅ Opened new ticket form');
  44 | 
  45 |   // ── 4. CUSTOMER: Fill ticket form ──────────────────────────
  46 |   await page.fill('input[type="text"]', ticketTitle);
  47 |   const textarea = page.locator('textarea').first();
  48 |   await textarea.fill(ticketDescription);
  49 | 
  50 |   // Select priority if dropdown exists
  51 |   const selectEl = page.locator('select').first();
  52 |   if (await selectEl.isVisible()) {
  53 |     await selectEl.selectOption('high');
  54 |   }
  55 | 
  56 |   await page.click('button[type="submit"]');
  57 |   await page.waitForTimeout(2000);
  58 |   console.log('✅ Ticket submitted');
  59 | 
  60 |   // ── 5. ADMIN: Login ─────────────────────────────────────────
  61 |   await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  62 |   await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  63 |   await page.fill('input[type="email"]', 'admin@wolfx.com');
  64 |   await page.fill('input[type="password"]', 'Admin@123');
  65 |   await page.click('button[type="submit"]');
  66 |   await page.waitForTimeout(2000);
  67 | 
  68 |   await page.click('text=Tickets');
  69 |   await page.waitForTimeout(1000);
  70 |   console.log('✅ Admin on tickets page');
  71 | 
  72 |   // ── 6. ADMIN: Assign ticket to agent ───────────────────────
  73 |   // Ticket should appear in list
  74 |   const ticketRow = page.locator('tr', { hasText: ticketTitle });
  75 |   await expect(ticketRow).toBeVisible({ timeout: 5000 });
  76 |   console.log('✅ Ticket visible in admin list');
  77 | 
  78 |   // ── 7. AGENT: Login ────────────────────────────────────────
  79 |   await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  80 |   await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  81 |   await page.fill('input[type="email"]', 'joao.agente@wolfx.com');
  82 |   await page.fill('input[type="password"]', 'Agente@123');
  83 |   await page.click('button[type="submit"]');
  84 |   await page.waitForTimeout(2000);
  85 | 
  86 |   await page.click('text=Tickets');
  87 |   await page.waitForTimeout(1000);
  88 |   console.log('✅ Agent on tickets page');
  89 | 
  90 |   // Verify ticket appears
  91 |   const agentTicketRow = page.locator('tr', { hasText: ticketTitle });
  92 |   await expect(agentTicketRow).toBeVisible({ timeout: 5000 });
  93 |   console.log('✅ Ticket visible for agent');
  94 | });
  95 | 
```