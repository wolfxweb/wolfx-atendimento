import { test, expect } from '@playwright/test';
const BASE = 'https://atendimento.wolfx.com.br';

test('debug login button', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  // Verify form exists
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ timeout: 5000 });
  console.log('Email input visible:', await emailInput.isVisible());
  
  await page.fill('input[type="email"]', 'admin@wolfx.com');
  await page.fill('input[type="password"]', 'Admin@123');
  
  // Intercept XHR/fetch
  const reqs: any[] = [];
  page.on('request', r => { if (r.url().includes('/auth')) reqs.push(r.url()); });
  
  await page.click('button[type="submit"]');
  await page.waitForTimeout(8000);
  
  console.log('Requests to /auth:', reqs);
  console.log('URL:', page.url());
  console.log('Errors:', errors);
  
  const body = await page.locator('body').textContent();
  console.log('Body:', body?.slice(0, 300));
});
