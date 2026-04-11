import { test, expect } from '@playwright/test';
const BASE = 'https://atendimento.wolfx.com.br';

test('debug api call', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
    else console.log(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', e => errors.push('PAGE ERROR: ' + e.message));
  page.on('request', r => { if (r.url().includes('/auth')) console.log('REQ:', r.method(), r.url()); });
  page.on('response', r => { if (r.url().includes('/auth')) console.log('RES:', r.status(), r.url(), r.body().then(b => console.log('BODY:', String(b).slice(0, 100)))); });
  
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  
  await page.fill('input[type="email"]', 'admin@wolfx.com');
  await page.fill('input[type="password"]', 'Admin@123');
  await page.click('button[type="submit"]');
  
  await page.waitForTimeout(5000);
  
  console.log('Errors:', errors);
  console.log('URL:', page.url());
  const body = await page.locator('body').textContent();
  console.log('Body:', body?.slice(0, 300));
});
