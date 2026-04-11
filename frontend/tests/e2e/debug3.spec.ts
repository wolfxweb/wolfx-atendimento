import { test, expect } from '@playwright/test';
const BASE = 'https://atendimento.wolfx.com.br';

test('debug simple', async ({ page }) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  const content = await page.content();
  console.log('HTML length:', content.length);
  console.log('First 500 chars:', content.slice(0, 500));
});
