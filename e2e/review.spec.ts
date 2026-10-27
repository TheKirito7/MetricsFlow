import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function login(page: Page, viewer = false) {
  await page.clock.setFixedTime(new Date('2026-10-27T12:00:00Z'));
  await page.goto('/login');
  await page
    .getByLabel('Work email')
    .fill(
      viewer
        ? (process.env.DEMO_VIEWER_EMAIL ?? 'viewer@metricsflow.test')
        : (process.env.DEMO_ADMIN_EMAIL ?? 'admin@metricsflow.test'),
    );
  await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await expect(page.getByTestId('mrr-value')).toBeVisible();
}
async function accessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
}

test('accessibility across login, every workspace page, details and the not-found route', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/login');
  await expect(page.getByLabel('Work email')).toBeVisible();
  await accessible(page);
  await login(page);
  for (const [path, title] of [
    ['/', 'Overview'],
    ['/customers', 'Customers'],
    ['/subscriptions', 'Subscriptions'],
    ['/transactions', 'Transactions'],
    ['/analytics', 'Analytics'],
    ['/settings', 'Settings'],
    ['/missing-report', 'Page not found'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: title, exact: true }).first()).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page).toHaveTitle(title + ' · MetricsFlow');
    await accessible(page);
  }
  const customers = await (await page.request.get('/api/v1/customers?page_size=1')).json();
  await page.goto('/customers/' + customers.items[0].id);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(customers.items[0].name);
  await accessible(page);
});

test('admin simulation is replay-safe and changes collected revenue without changing MRR', async ({
  page,
}) => {
  await login(page);
  const before = await (await page.request.get('/api/v1/analytics/overview')).json();
  const subscriptions = await (
    await page.request.get('/api/v1/subscriptions?status=active&page_size=1')
  ).json();
  const subscription = subscriptions.items[0];
  const customer = await (
    await page.request.get('/api/v1/customers/' + subscription.customer_id)
  ).json();
  await page.getByRole('link', { name: 'Transactions', exact: true }).click();
  await page.getByRole('button', { name: 'Record simulated payment', exact: true }).click();
  await page.getByLabel('Find customer').fill(customer.email);
  await expect(page.getByRole('option', { name: new RegExp(customer.email) })).toBeAttached();
  await page.getByLabel('Customer', { exact: true }).selectOption(customer.id);
  await page.getByLabel('Active subscription').selectOption(subscription.id);
  await accessible(page);
  const paymentResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/transactions/simulate') && response.request().method() === 'POST',
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Record simulated payment', exact: true })
    .click();
  const response = await paymentResponse;
  expect(response.status()).toBe(201);
  const payment = await response.json();
  const payload = response.request().postDataJSON();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText(payment.external_reference, { exact: true })).toBeVisible();
  const me = await (await page.request.get('/api/v1/me')).json();
  const replay = await page.request.post('/api/v1/transactions/simulate', {
    headers: { Origin: 'http://localhost:5174', 'X-CSRF-Token': me.csrf_token },
    data: payload,
  });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).id).toBe(payment.id);
  const after = await (await page.request.get('/api/v1/analytics/overview')).json();
  expect(after.paid_cents).toBe(before.paid_cents + subscription.price_cents);
  expect(after.current).toEqual(before.current);
});

test('filter URLs survive reload and navigation panels handle keyboard focus', async ({ page }) => {
  await login(page);
  await page.goto(
    '/transactions?status=paid&sort=amount_cents&order=asc&page=2&start_date=2026-01-01&end_date=2026-10-27',
  );
  await expect(page.getByLabel('Transaction status')).toHaveValue('paid');
  await expect(page.getByLabel('Sort transactions')).toHaveValue('amount_cents');
  await page.reload();
  await expect(page.getByLabel('Transaction status')).toHaveValue('paid');
  const exportResponse = page.waitForResponse((response) =>
    response.url().includes('/reports/transactions.csv'),
  );
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await exportResponse).url()).toContain('status=paid');
  await download;
  await page.getByRole('button', { name: 'User menu' }).click();
  await expect(page.getByRole('dialog', { name: 'Account menu' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'User menu' })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('dialog', { name: 'Workspace navigation' })).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'User menu' })).not.toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    x: scrollX,
    overflow: Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map((element) => ({
        tag: element.tagName,
        class: element.className,
        right: element.getBoundingClientRect().right,
        width: element.getBoundingClientRect().width,
      }))
      .filter((element) => element.right > innerWidth + 1 && element.width > 0)
      .slice(0, 12),
  }));
  expect(layout.scroll, JSON.stringify(layout)).toBeLessThanOrEqual(layout.width);
});

test('viewer cannot see or call simulated payment mutation', async ({ page }) => {
  await login(page, true);
  await page.getByRole('link', { name: 'Transactions', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record simulated payment' })).toHaveCount(0);
  const me = await (await page.request.get('/api/v1/me')).json();
  const subs = await (
    await page.request.get('/api/v1/subscriptions?status=active&page_size=1')
  ).json();
  const result = await page.request.post('/api/v1/transactions/simulate', {
    headers: { Origin: 'http://localhost:5174', 'X-CSRF-Token': me.csrf_token },
    data: { subscription_id: subs.items[0].id, idempotency_key: crypto.randomUUID() },
  });
  expect(result.status()).toBe(403);
});
