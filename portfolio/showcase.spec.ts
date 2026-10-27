import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('capture a clean, read-only portfolio and a one-minute product tour', async ({ page }) => {
  await mkdir('docs/screenshots', { recursive: true });
  await mkdir('docs/demo', { recursive: true });
  await page.clock.setFixedTime(new Date('2026-10-27T12:00:00Z'));
  await page.goto('/login');
  await page
    .getByLabel('Work email')
    .fill(process.env.DEMO_VIEWER_EMAIL ?? 'viewer@metricsflow.test');
  await page.getByLabel('Password', { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await expect(page.getByTestId('mrr-value')).toBeVisible();
  const customers = await (await page.request.get('/api/v1/customers')).json();
  expect(customers.total).toBe(320);
  const testCustomers = await (await page.request.get('/api/v1/customers?search=E2E')).json();
  expect(testCustomers.total).toBe(0);
  const report = await (
    await page.request.get('/api/v1/analytics/overview?start_date=2025-10-28&end_date=2026-10-27')
  ).json();
  expect(report.history_start < '2024-10-27').toBeTruthy();
  expect(report.snapshot_comparison_available).toBe(true);
  expect(report.revenue_comparison_available).toBe(true);
  const transactions = await (await page.request.get('/api/v1/transactions')).json();
  for (const transaction of transactions.items)
    expect(transaction.external_reference).toMatch(/^SIM-(\d{4}-\d{3}|ADD-\d+-\d+)$/);
  await expect(
    page.getByText('Insufficient history for a full prior-period comparison.'),
  ).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  const videoStarted = Date.now();
  const capture = async (name: string) => {
    await expect(page.locator('main .state[role="status"]')).toHaveCount(0);
    await page.screenshot({
      path: `docs/screenshots/${name}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  };
  // Deliberate pauses pace the exported product tour, rather than synchronizing assertions.
  await capture('overview');
  await page.waitForTimeout(5000);
  await page.getByRole('button', { name: 'Collected', exact: true }).click();
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Recurring', exact: true }).click();
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await capture('overview-dark');
  await page.waitForTimeout(4000);
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  for (const [name, heading] of [
    ['customers', 'Customers'],
    ['subscriptions', 'Subscriptions'],
    ['transactions', 'Transactions'],
    ['analytics', 'Analytics'],
    ['settings', 'Settings'],
  ]) {
    await page.getByRole('link', { name: heading, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await capture(name);
    await page.waitForTimeout(5000);
  }
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Subscription activity' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const cards = page.getByRole('list', { name: 'Transactions', exact: true });
  await expect(cards).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight))
    .toBeGreaterThan(3000);
  await capture('mobile');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await cards.scrollIntoViewIfNeeded();
  await page.waitForTimeout(4000);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await page.waitForTimeout(Math.max(0, 60_000 - (Date.now() - videoStarted)));
  const video = page.video();
  await page.context().close();
  await video!.saveAs('docs/demo/metricsflow-tour.webm');
});
