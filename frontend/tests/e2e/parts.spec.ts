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

async function createPart(page: any, name: string, sku: string) {
  await page.getByRole('button', { name: 'Nova Peça' }).last().click();
  await page.waitForTimeout(500);
  await page.locator('input[placeholder="Nome da peça"]').fill(name);
  await page.locator('input[placeholder="SKU da peça"]').fill(sku);
  await page.locator('form input[type="number"]').nth(0).fill('10.50');
  await page.locator('form input[type="number"]').nth(1).fill('25.00');

  // Wait for the POST response before assuming success
  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/api/v1/parts') && resp.status() >= 200 && resp.status() < 300, { timeout: 15000 }),
    page.locator('button[type="submit"]').click(),
  ]);

  // Wait for modal to close
  await page.waitForSelector('input[placeholder="Nome da peça"]', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

test('Parts page loads', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`${BASE}/admin/parts`);
  const resp = await page.waitForResponse(r => r.url().includes('/api/v1/parts') && r.status() === 200, { timeout: 15000 });
  await expect(page.locator('h1', { hasText: 'Peças' })).toBeVisible({ timeout: 10000 });
});

test('Create part', async ({ page }) => {
  const timestamp = Date.now();
  const partName = `Peca Teste ${timestamp}`;
  await loginAsAdmin(page);
  await page.goto(`${BASE}/admin/parts`);
  await page.waitForResponse(r => r.url().includes('/api/v1/parts') && r.status() === 200, { timeout: 15000 });
  await createPart(page, partName, `SKU-${timestamp}`);
  await expect(page.getByText(partName, { exact: false })).toBeVisible({ timeout: 10000 });
});

test('Edit part', async ({ page }) => {
  const timestamp = Date.now();
  const partName = `Peca Edit ${timestamp}`;
  await loginAsAdmin(page);
  await page.goto(`${BASE}/admin/parts`);
  await page.waitForResponse(r => r.url().includes('/api/v1/parts') && r.status() === 200, { timeout: 15000 });
  await createPart(page, partName, `SKU-EDIT-${timestamp}`);
  await expect(page.getByText(partName, { exact: false })).toBeVisible({ timeout: 10000 });

  // Edit button is the first icon button in the actions column (pencil icon, no text)
  await page.locator('tbody tr').first().locator('button').nth(0).click();
  await page.waitForTimeout(500);
  await page.locator('input[placeholder="Nome da peça"]').clear();
  await page.locator('input[placeholder="Nome da peça"]').fill(`${partName} Alt`);

  await Promise.all([
    page.waitForResponse(resp => resp.url().includes('/api/v1/parts') && resp.status() === 200, { timeout: 15000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  await page.waitForSelector('input[placeholder="Nome da peça"]', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await expect(page.getByText(`${partName} Alt`, { exact: false })).toBeVisible({ timeout: 10000 });
});

test('Delete part', async ({ page }) => {
  const timestamp = Date.now();
  const partName = `Peca Delete ${timestamp}`;
  await loginAsAdmin(page);
  await page.goto(`${BASE}/admin/parts`);
  await page.waitForResponse(r => r.url().includes('/api/v1/parts') && r.status() === 200, { timeout: 15000 });
  await createPart(page, partName, `SKU-DEL-${timestamp}`);
  await expect(page.getByText(partName, { exact: false })).toBeVisible({ timeout: 10000 });

  // Delete button is the second icon button in the actions column (trash icon, no text)
  await page.locator('tbody tr').first().locator('button').nth(1).click();
  await page.waitForTimeout(500);
  // Now the delete confirmation modal is open - click "Eliminar" to confirm
  await page.getByRole('button', { name: 'Eliminar' }).click();
  await page.waitForTimeout(2000);
});

test('Search parts', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`${BASE}/admin/parts`);
  await page.waitForResponse(r => r.url().includes('/api/v1/parts') && r.status() === 200, { timeout: 15000 });
  const searchInput = page.locator('input[type="search"]').first();
  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill('Sensor');
  }
  await page.waitForTimeout(1000);
});
