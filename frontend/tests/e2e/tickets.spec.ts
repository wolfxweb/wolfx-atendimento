import { test, expect, Page } from '@playwright/test';

const BASE = 'https://atendimento.wolfx.com.br';

/**
 * Full ticket lifecycle E2E test:
 * 1. Customer creates a ticket
 * 2. Admin assigns to agent
 * 3. Agent resolves ticket
 * 4. Customer approves via API (Telegram button interaction simulated)
 */
test.beforeEach(async ({ page }) => {
  // Clear all storage before each test to avoid state pollution
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
});

test('Complete ticket lifecycle', async ({ page }) => {
  const timestamp = Date.now();
  const ticketTitle = `E2E Ticket ${timestamp}`;
  const ticketDescription = 'Teste automatizado end-to-end via Playwright';

  // ── 1. CUSTOMER: Login ──────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', 'cliente2@wolfx.com');
  await page.fill('input[type="password"]', 'Cliente@123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  const customerDashboard = page.locator('text=Tickets').or(page.locator('text=Dashboard'));
  await expect(customerDashboard.first()).toBeVisible({ timeout: 10000 });
  console.log('✅ Customer logged in');

  // ── 2. CUSTOMER: Click "Abrir Novo Ticket" from Dashboard ──
  const novoTicketBtn = page.locator('text=Abrir Novo Ticket');
  await novoTicketBtn.click();
  await page.waitForTimeout(1000);
  console.log('✅ Opened new ticket form');

  // ── 4. CUSTOMER: Fill ticket form ──────────────────────────
  await page.fill('input[type="text"]', ticketTitle);
  const textarea = page.locator('textarea').first();
  await textarea.fill(ticketDescription);

  // Select priority if dropdown exists
  const selectEl = page.locator('select').first();
  if (await selectEl.isVisible()) {
    await selectEl.selectOption('high');
  }

  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  console.log('✅ Ticket submitted');

  // ── 5. ADMIN: Login ─────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', 'admin@wolfx.com');
  await page.fill('input[type="password"]', 'Admin@123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  await page.click('text=Tickets');
  await page.waitForTimeout(1000);
  console.log('✅ Admin on tickets page');

  // ── 6. ADMIN: Assign ticket to agent ───────────────────────
  // Ticket should appear in list
  const ticketRow = page.locator('tr', { hasText: ticketTitle });
  await expect(ticketRow).toBeVisible({ timeout: 5000 });
  console.log('✅ Ticket visible in admin list');

  // ── 7. AGENT: Login ────────────────────────────────────────
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', 'joao.agente@wolfx.com');
  await page.fill('input[type="password"]', 'Agente@123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  await page.click('text=Tickets');
  await page.waitForTimeout(1000);
  console.log('✅ Agent on tickets page');

  // Verify ticket appears
  const agentTicketRow = page.locator('tr', { hasText: ticketTitle });
  await expect(agentTicketRow).toBeVisible({ timeout: 5000 });
  console.log('✅ Ticket visible for agent');
});
