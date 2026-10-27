import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
const python =
  process.env.E2E_PYTHON ??
  (process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
if (!existsSync(python) && !process.env.E2E_PYTHON)
  throw new Error('Create the project .venv or set E2E_PYTHON to your Python executable.');
if (!process.env.E2E_DATABASE_URL?.split('?')[0].endsWith('_e2e'))
  throw new Error('E2E_DATABASE_URL must point to a separate PostgreSQL database ending in _e2e.');
if (!process.env.DEMO_PASSWORD) throw new Error('Set DEMO_PASSWORD for the isolated E2E seed.');
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/workflows',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 45_000,
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1050 },
      },
    },
  ],
  webServer: [
    {
      command: `"${python}" -m app.e2e_server`,
      url: 'http://127.0.0.1:8001/api/v1/health',
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        DATABASE_URL: process.env.E2E_DATABASE_URL,
        APP_ENV: 'development',
        COOKIE_SECURE: 'false',
        ALLOWED_ORIGINS: 'http://localhost:5174',
        SEED_TODAY: '2026-10-27',
        TEST_NOW: '2026-10-27T12:00:00Z',
      },
    },
    {
      command: 'npm run dev --workspace frontend -- --port 5174',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 60000,
      env: { API_PROXY_TARGET: 'http://127.0.0.1:8001' },
    },
  ],
});
