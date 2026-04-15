import { test, expect } from '@playwright/test';

const BASE = 'https://atendimento.wolfx.com.br';

test.beforeEach(async ({ page }) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
});

async function loginAsAdmin(page: any) {
  await page.fill('input[type="email"]', 'admin@wolfx.com');
  await page.fill('input[type="password"]', 'Admin@123');
  const [response] = await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/api/v1/auth/login') && resp.status() === 200, { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  if (response.status() !== 200) throw new Error(`Login failed: ${response.status()}`);
  await page.waitForTimeout(300);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  if (!token) throw new Error('No token after login');
}

async function waitForModalClose(page: any) {
  await page.waitForTimeout(2000);
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('input[placeholder*="Nome"]', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

test('Products page loads', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`${BASE}/admin/products`);
  await page.waitForResponse(r => r.url().includes('/api/v1/products') && r.status() === 200, { timeout: 15000 });
  await expect(page.locator('h2', { hasText: 'Produtos' })).toBeVisible({ timeout: 10000 });
});

test('Create product', async ({ page }) => {
  const timestamp = Date.now();
  const productName = `Playwright Product ${timestamp}`;

  await loginAsAdmin(page);
  await page.goto(`${BASE}/admin/products`);
  await page.waitForResponse(r => r.url().includes('/api/v1/products') && r.status() === 200, { timeout: 15000 });

  await page.locator('button', { hasText: 'Novo Produto' }).click();
  await page.waitForTimeout(500);

  // Fill the form - use placeholder matching
  await page.locator('input[placeholder*="Nome"]').fill(productName);

  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/api/v1/products') && resp.status() >= 200 && resp.status() < 300, { timeout: 15000 }),
    page.locator('button[type="submit"]').click(),
  ]);

  await waitForModalClose(page);
  await expect(page.getByText(productName, { exact: false })).toBeVisible({ timeout: 10000 });
});

test('Edit product', async ({ page }) => {
  const timestamp = Date.now();
  const productName = `Playwright Edit ${timestamp}`;

  await loginAsAdmin(page);
  await page.goto(`${BASE}/admin/products`);
  await page.waitForResponse(r => r.url().includes('/api/v1/products') && r.status() === 200, { timeout: 15000 });

  // Create a product first
  await page.locator('button', { hasText: 'Novo Produto' }).click();
  await page.waitForTimeout(500);
  await page.locator('input[placeholder*="Nome"]').fill(productName);
  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/api/v1/products') && resp.status() >= 200 && resp.status() < 300, { timeout: 15000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  await waitForModalClose(page);
  await expect(page.getByText(productName, { exact: false })).toBeVisible({ timeout: 10000 });

  // Edit: click "Editar" button (text button in card, NOT icon button)
  await page.getByRole('button', { name: 'Editar' }).first().click();
  await page.waitForTimeout(500);
  await page.locator('input[placeholder*="Nome"]').clear();
  await page.locator('input[placeholder*="Nome"]').fill(`${productName} Alt`);
  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/api/v1/products') && resp.status() >= 200 && resp.status() < 300, { timeout: 15000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  await waitForModalClose(page);
  await expect(page.getByText(`${productName} Alt`, { exact: false })).toBeVisible({ timeout: 10000 });
});

test('Delete product', async ({ page }) => {
  const timestamp = Date.now();
  const productName = `Playwright Delete ${timestamp}`;

  await loginAsAdmin(page);
  await page.goto(`${BASE}/admin/products`);
  await page.waitForResponse(r => r.url().includes('/api/v1/products') && r.status() === 200, { timeout: 15000 });

  // Create a product first
  await page.locator('button', { hasText: 'Novo Produto' }).click();
  await page.waitForTimeout(500);
  await page.locator('input[placeholder*="Nome"]').fill(productName);
  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/api/v1/products') && resp.status() >= 200 && resp.status() < 300, { timeout: 15000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  await waitForModalClose(page);
  await expect(page.getByText(productName, { exact: false })).toBeVisible({ timeout: 10000 });

  // Delete: click "Eliminar" button (text button in card)
  await page.getByRole('button', { name: 'Eliminar' }).first().click();
  await page.waitForTimeout(500);
  // Confirm in modal - the modal has an "Eliminar" button too
  await page.getByRole('button', { name: 'Eliminar' }).click();
  await page.waitForTimeout(2000);
});
