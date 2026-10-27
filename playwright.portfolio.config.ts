import { defineConfig } from '@playwright/test';

if (!process.env.PORTFOLIO_DATABASE_URL?.split('?')[0].endsWith('_portfolio'))
  throw new Error('PORTFOLIO_DATABASE_URL must name a separate database ending in _portfolio.');
if (!process.env.DEMO_PASSWORD) throw new Error('Set DEMO_PASSWORD for portfolio fixtures.');
const python =
  process.env.E2E_PYTHON ??
  (process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');

export default defineConfig({
  testDir: './portfolio',
  outputDir: './test-results/portfolio',
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5175',
    viewport: { width: 1440, height: 1050 },
    video: { mode: 'on', size: { width: 1440, height: 1050 } },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `"${python}" -m app.e2e_server`,
      url: 'http://127.0.0.1:8002/api/v1/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: process.env.PORTFOLIO_DATABASE_URL,
        APP_ENV: 'development',
        COOKIE_SECURE: 'false',
        ALLOWED_ORIGINS: 'http://localhost:5175',
        SEED_TODAY: '2026-10-27',
        TEST_NOW: '2026-10-27T12:00:00Z',
        PORTFOLIO_CAPTURE: 'true',
        READ_ONLY_DEMO: 'true',
      },
    },
    {
      command: 'npm run dev --workspace frontend -- --port 5175',
      url: 'http://localhost:5175',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_PROXY_TARGET: 'http://127.0.0.1:8002' },
    },
  ],
});
