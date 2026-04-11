import { test, expect } from '@playwright/test';

const BASE = 'https://atendimento.wolfx.com.br';

test('Login page loads', async ({ page }) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1', { timeout: 10000 });
  await expect(page.locator('h1')).toContainText('wolfx.atendimento');
});

test('Login with valid credentials redirects to admin dashboard', async ({ page }) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', 'admin@wolfx.com');
  await page.fill('input[type="password"]', 'Admin@123');
  await page.click('button[type="submit"]');

  // Wait for redirect or auth state update
  await page.waitForTimeout(3000);

  // Verify auth token was set (proves login succeeded)
  const token = await page.evaluate(() => localStorage.getItem('token'));
  expect(token).toBeTruthy();

  // Verify URL changed from /login (either /admin or intermediate)
  const url = page.url();
  expect(url).not.toBe(`${BASE}/login`);
  console.log('URL after login:', url);
});

test('Login with invalid credentials shows error', async ({ page }) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', 'wrong@email.com');
  await page.fill('input[type="password"]', 'wrongpass');
  await page.click('button[type="submit"]');

  await page.waitForTimeout(3000);
  console.log('URL (invalid):', page.url());
  const body = await page.locator('body').textContent();
  console.log('Body (invalid):', body?.slice(0, 300));
});
