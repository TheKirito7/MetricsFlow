import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const admin = process.env.DEMO_ADMIN_EMAIL ?? 'admin@metricsflow.test';
const viewer = process.env.DEMO_VIEWER_EMAIL ?? 'viewer@metricsflow.test';
const password = process.env.DEMO_PASSWORD;
if (!password)
  throw new Error(
    'Set DEMO_PASSWORD to the configured development seed password before running E2E.',
  );
async function login(page: Page, email = admin) {
  await page.clock.setFixedTime(new Date('2026-10-27T12:00:00Z'));
  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password!);
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page.getByTestId('mrr-value')).toBeVisible();
}
test('login, persisted dashboard data, theme and logout', async ({ page }) => {
  await login(page);
  const response = await page.request.get('/api/v1/analytics/overview');
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).current.mrr_cents).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveClass('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveClass('dark');
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
});
test('create and edit customer, assign subscription, verify persisted MRR change', async ({
  page,
}) => {
  await login(page);
  const before = (await (await page.request.get('/api/v1/analytics/overview')).json()).current
    .mrr_cents;
  const unique = '001';
  const name = 'E2E Customer ' + unique;
  const email = 'e2e.' + unique + '@example.com';
  await page.getByRole('link', { name: 'Customers', exact: true }).click();
  await page.getByRole('button', { name: 'Add customer', exact: true }).click();
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Company (optional)').fill('Workflow Studio');
  await page.getByRole('button', { name: 'Create customer', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByLabel('Search customers').fill(email);
  await page.getByRole('link', { name: new RegExp(name + ' ' + email) }).click();
  await expect(page.getByRole('heading', { name, exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Edit customer', exact: true }).click();
  await page.getByLabel('Company (optional)').fill('Updated Studio');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Updated Studio', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Assign subscription', exact: true }).click();
  const plans = (await (await page.request.get('/api/v1/plans')).json()) as {
    id: string;
    price_cents: number;
    interval: string;
  }[];
  const plan = plans.find((p) => p.interval === 'monthly')!;
  await page.getByLabel('Subscription plan').selectOption(plan.id);
  await page.getByRole('button', { name: 'Assign subscription', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('cell', { name: 'active', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  const after = (await (await page.request.get('/api/v1/analytics/overview')).json()).current
    .mrr_cents;
  expect(after).toBe(before + plan.price_cents);
  await expect(page.getByTestId('mrr-value')).toContainText(
    new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(after / 100),
  );
});
test('filter ledger and export matching CSV', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Transactions', exact: true }).click();
  await page.getByLabel('Reporting period').selectOption('365');
  await page.getByLabel('Transaction status').selectOption('paid');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(page.locator('tbody .badge').first()).toHaveText('paid');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('metricsflow-transactions.csv');
  const stream = await download.createReadStream();
  let csv = '';
  for await (const chunk of stream!) csv += chunk.toString();
  expect(csv).toContain('amount_cents');
  expect(csv).toContain(',paid,');
  expect(csv).not.toContain(',failed,');
});
test('viewer has read-only UI and backend permissions', async ({ page }) => {
  await login(page, viewer);
  await page.getByRole('link', { name: 'Customers', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add customer', exact: true })).toHaveCount(0);
  const me = await (await page.request.get('/api/v1/me')).json();
  const response = await page.request.post('/api/v1/customers', {
    headers: { Origin: 'http://localhost:5174', 'X-CSRF-Token': me.csrf_token },
    data: { name: 'Forbidden', email: 'forbidden@example.com' },
  });
  expect(response.status()).toBe(403);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Organization name')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save preferences' })).toHaveCount(0);
});
test('responsive mobile navigation and keyboard-accessible forms', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Customers', exact: true }).click();
  await page.getByRole('button', { name: 'Add customer', exact: true }).click();
  await expect(page.getByLabel('Full name')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add customer', exact: true })).toBeFocused();
});
test('dashboard and form accessibility in both themes', async ({ page }) => {
  await login(page);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  const dark = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    dark.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.getByRole('link', { name: 'Customers', exact: true }).click();
  await page.getByRole('button', { name: 'Add customer', exact: true }).click();
  const form = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(
    form.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
});

test('plan editing preserves subscription prices and cancellation updates MRR', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('link', { name: 'Subscriptions', exact: true }).click();
  await page.getByRole('button', { name: 'Create plan', exact: true }).click();
  await page.getByLabel('Plan name').fill('Workflow Plan');
  await page.getByLabel('Price (EUR)').fill('120.00');
  await page.getByRole('button', { name: 'Create plan', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const plans = (await (await page.request.get('/api/v1/plans')).json()) as {
    id: string;
    name: string;
  }[];
  const plan = plans.find((p) => p.name === 'Workflow Plan')!;
  const me = await (await page.request.get('/api/v1/me')).json();
  const create = await page.request.post('/api/v1/customers', {
    headers: { Origin: 'http://localhost:5174', 'X-CSRF-Token': me.csrf_token },
    data: { name: 'Lifecycle Customer', email: 'lifecycle@example.com' },
  });
  expect(create.status()).toBe(201);
  const customer = await create.json();
  const before = (await (await page.request.get('/api/v1/analytics/overview')).json()).current
    .mrr_cents;
  await page.getByRole('button', { name: 'Assign subscription', exact: true }).click();
  await page.getByLabel('Find customer').fill('lifecycle@example.com');
  await expect(page.getByRole('option', { name: /Lifecycle Customer/ })).toBeAttached();
  await page.getByLabel('Customer', { exact: true }).selectOption(customer.id);
  await page.getByLabel('Subscription plan').selectOption(plan.id);
  await page.getByRole('button', { name: 'Assign subscription', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Edit Workflow Plan plan' }).click();
  await page.getByLabel('Price (EUR)').fill('150.00');
  await page.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'View subscription for Lifecycle Customer' }).click();
  await expect(page.getByText('€120.00 / month', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel subscription', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm cancellation', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('cancelled', { exact: true })).toBeVisible();
  const after = (await (await page.request.get('/api/v1/analytics/overview')).json()).current
    .mrr_cents;
  expect(after).toBe(before);
});

test('organization preferences persist and reporting uses the selected timezone', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Organization name').fill('Northstar Labs');
  await page.getByLabel('Reporting timezone').selectOption('Europe/Berlin');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page.getByText('Workspace preferences saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Organization name')).toHaveValue('Northstar Labs');
  expect((await (await page.request.get('/api/v1/analytics/overview')).json()).timezone).toBe(
    'Europe/Berlin',
  );
  await page.getByLabel('Organization name').fill('Northstar Studio');
  await page.getByLabel('Reporting timezone').selectOption('Europe/Lisbon');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page.getByText('Workspace preferences saved.')).toBeVisible();
});
