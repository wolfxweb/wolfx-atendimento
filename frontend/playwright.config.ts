import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [['json', { outputFile: '/tmp/e2e_report/results.json' }], ['list']] : [['list']],
  use: {
    baseURL: 'https://atendimento.wolfx.com.br',
    trace: 'on-first-retry',
    launchOptions: {
      args: ['--disable-web-security'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
