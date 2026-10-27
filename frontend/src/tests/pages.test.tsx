import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';
import Customers from '@/features/customers/customers';
import CustomerDetail from '@/features/customers/customer-detail';
import Subscriptions from '@/features/subscriptions/subscriptions';
import Transactions from '@/features/transactions/transactions';
import Dashboard from '@/features/dashboard/dashboard';
import Settings from '@/features/settings/settings';
import Login from '@/features/auth/login';
import AppLayout from '@/components/layout/app-layout';
import { analytics, customer, detail, ids, ledger, me, plan, subscription } from './fixtures';

beforeEach(() => {
  vi.spyOn(api, 'me').mockResolvedValue(structuredClone(me));
  vi.spyOn(api, 'get').mockImplementation(async function <T>(path: string): Promise<T> {
    const base = path.split('?')[0];
    const values: Record<string, unknown> = {
      '/customers': { items: [customer], total: 41, page: 1, page_size: 20 },
      ['/customers/' + ids.customer]: detail,
      '/plans': [plan],
      '/subscriptions': { items: [subscription], total: 41, page: 1, page_size: 20 },
      ['/subscriptions/' + ids.subscription]: subscription,
      '/transactions': ledger,
      ['/transactions/' + ids.transaction]: ledger.items[0],
      '/analytics/overview': analytics,
    };
    if (!(base in values)) throw new Error('Unexpected API fixture path: ' + path);
    return structuredClone(values[base]) as T;
  });
  vi.spyOn(api, 'post').mockImplementation(async function <T>(path: string): Promise<T> {
    return structuredClone(
      path.includes('subscriptions')
        ? subscription
        : path.includes('simulate')
          ? ledger.items[0]
          : customer,
    ) as T;
  });
  vi.spyOn(api, 'patch').mockImplementation(async function <T>(path: string): Promise<T> {
    return structuredClone(
      path.includes('plans')
        ? plan
        : path.includes('subscriptions')
          ? subscription
          : path.includes('organization')
            ? me.organization
            : customer,
    ) as T;
  });
  vi.spyOn(api, 'delete').mockResolvedValue(undefined);
  vi.spyOn(api, 'downloadTransactions').mockResolvedValue(undefined);
});
function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}
function renderPage(element: ReactNode, path = '/', authenticated = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (authenticated) client.setQueryData(['me'], structuredClone(me));
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={element} />
        </Routes>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, client, user: userEvent.setup() };
}

describe('customer pages', () => {
  it('persists search, sort, status and pagination in a shareable URL', async () => {
    const { user } = renderPage(
      <Customers />,
      '/customers?status=active&sort=name&order=asc&page=2',
    );
    await screen.findByRole('link', { name: /Ada Lovelace ada@example.com/ });
    expect(screen.getByLabelText('Customer status')).toHaveValue('active');
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('page=3'));
    await user.type(screen.getByLabelText('Search customers'), 'ada');
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('search=ada')),
    );
    expect(screen.getByTestId('location')).toHaveTextContent('page=1');
    await user.selectOptions(screen.getByLabelText('Customer status'), 'archived');
    await user.selectOptions(screen.getByLabelText('Sort customers'), 'email');
    await user.click(screen.getByRole('button', { name: 'Sort descending' }));
    expect(screen.getByTestId('location')).toHaveTextContent('sort=email');
    expect(screen.getByTestId('location')).toHaveTextContent('status=archived');
    expect(screen.getByTestId('location')).toHaveTextContent('order=desc');
  });
  it('creates a customer from the page and returns to the directory', async () => {
    const { user } = renderPage(<Customers />, '/customers');
    await user.click(screen.getByRole('button', { name: 'Add customer' }));
    await user.type(screen.getByLabelText('Full name'), 'Grace Hopper');
    await user.type(screen.getByLabelText('Email address'), 'grace@example.com');
    await user.click(screen.getByRole('button', { name: 'Create customer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.post).toHaveBeenCalledWith(
      '/customers',
      expect.objectContaining({ name: 'Grace Hopper', email: 'grace@example.com' }),
    );
  });
  it('loads profile history and supports edit, assignment and archive confirmation', async () => {
    const { user } = renderPage(
      <Routes>
        <Route path="/customers/:id" element={<CustomerDetail />} />
      </Routes>,
      '/customers/' + ids.customer,
    );
    await screen.findByRole('heading', { name: 'Ada Lovelace', level: 1 });
    await user.click(screen.getByRole('button', { name: 'Edit customer' }));
    await user.clear(screen.getByLabelText('Full name'));
    await user.type(screen.getByLabelText('Full name'), 'Ada Updated');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/customers/' + ids.customer,
        expect.objectContaining({ name: 'Ada Updated' }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Assign subscription' }));
    await screen.findByLabelText('Subscription plan');
    await user.selectOptions(screen.getByLabelText('Subscription plan'), ids.plan);
    await user.click(screen.getAllByRole('button', { name: 'Assign subscription' }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Archive' }));
    await user.click(screen.getByRole('button', { name: 'Archive customer' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/customers/' + ids.customer));
  });
  it('recovers from a page request error', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError(503, 'Database unavailable'));
    const { user } = renderPage(<Customers />, '/customers');
    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('link', { name: /Ada Lovelace ada@example.com/ });
  });
});

describe('reporting and ledger pages', () => {
  it('shows actionable export errors and lets the user retry', async () => {
    const { user } = renderPage(<Transactions />, '/transactions');
    vi.mocked(api.downloadTransactions).mockRejectedValueOnce(
      new ApiError(422, 'Narrow your filters to export at most 50,000 transactions'),
    );
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Narrow your filters');
    await user.selectOptions(screen.getByLabelText('Transaction status'), 'paid');
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
  it('starts a new payment operation when the subscription selection changes', async () => {
    const original = vi.mocked(api.get).getMockImplementation()!;
    const otherId = '30000000-0000-4000-8000-000000000002';
    vi.mocked(api.get).mockImplementation(async <T,>(path: string): Promise<T> =>
      path.startsWith('/subscriptions')
        ? ({
            items: [subscription, { ...subscription, id: otherId, plan_name: 'Scale' }],
            total: 2,
            page: 1,
            page_size: 100,
          } as T)
        : ((await original(path)) as T),
    );
    const { user } = renderPage(<Transactions />, '/transactions');
    await user.click(screen.getByRole('button', { name: 'Record simulated payment' }));
    await user.selectOptions(
      await screen.findByLabelText('Customer', { exact: true }),
      ids.customer,
    );
    await user.selectOptions(await screen.findByLabelText('Active subscription'), ids.subscription);
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(503, 'Response was lost'));
    await user.click(screen.getAllByRole('button', { name: 'Record simulated payment' }).at(-1)!);
    await screen.findByText('Response was lost');
    await user.selectOptions(screen.getByLabelText('Active subscription'), otherId);
    await user.click(screen.getAllByRole('button', { name: 'Record simulated payment' }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const calls = vi
      .mocked(api.post)
      .mock.calls.filter(([path]) => path === '/transactions/simulate');
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).not.toEqual(calls[1][1]);
    expect(calls[1][1]).toEqual(
      expect.objectContaining({ subscription_id: otherId, idempotency_key: expect.any(String) }),
    );
  });
  it('distinguishes snapshot growth from collected period growth', async () => {
    const { user } = renderPage(<Dashboard />);
    await screen.findByTestId('mrr-value');
    expect(screen.getAllByText('since period start').length).toBeGreaterThanOrEqual(5);
    await user.click(screen.getByRole('button', { name: 'Collected' }));
    expect(screen.getByText('vs previous period')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Reporting period'), '7');
    expect(screen.getByTestId('location')).toHaveTextContent('start_date=');
    await user.selectOptions(screen.getByLabelText('Reporting period'), 'custom');
    await user.clear(screen.getByLabelText('Start date'));
    await user.type(screen.getByLabelText('Start date'), '2026-10-01');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByTestId('location')).toHaveTextContent('start_date=2026-10-01');
  });
  it('loads analytics tables and allows chart data inspection', async () => {
    const { user } = renderPage(<Dashboard analytics />, '/analytics');
    await screen.findByRole('heading', { name: 'Revenue by plan' });
    await user.click(screen.getAllByText('View chart data')[0]);
    expect(screen.getByRole('columnheader', { name: 'Snapshot MRR' })).toBeInTheDocument();
  });
  it('filters the ledger, exposes export filters and opens transaction details', async () => {
    const { user } = renderPage(
      <Transactions />,
      '/transactions?status=paid&sort=amount_cents&page=2',
    );
    await screen.findByRole('button', { name: 'View transaction SIM-TEST' });
    await user.selectOptions(screen.getByLabelText('Transaction status'), 'failed');
    await user.selectOptions(screen.getByLabelText('Sort transactions'), 'timestamp');
    await user.click(screen.getByRole('button', { name: 'Sort ascending' }));
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(api.downloadTransactions).toHaveBeenCalledWith(expect.stringContaining('status=failed'));
    await user.click(screen.getByRole('button', { name: 'View transaction SIM-TEST' }));
    await screen.findByRole('heading', { name: 'Transaction details' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('retries a simulated payment with the same idempotency key', async () => {
    const { user } = renderPage(<Transactions />, '/transactions');
    await user.click(screen.getByRole('button', { name: 'Record simulated payment' }));
    await screen.findByLabelText('Customer', { exact: true });
    await user.selectOptions(screen.getByLabelText('Customer', { exact: true }), ids.customer);
    await screen.findByLabelText('Active subscription');
    await user.selectOptions(screen.getByLabelText('Active subscription'), ids.subscription);
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(503, 'Retry this request'));
    await user.click(screen.getAllByRole('button', { name: 'Record simulated payment' }).at(-1)!);
    await screen.findByText('Retry this request');
    await user.click(screen.getAllByRole('button', { name: 'Record simulated payment' }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const calls = vi
      .mocked(api.post)
      .mock.calls.filter(([path]) => path === '/transactions/simulate');
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toEqual(calls[1][1]);
  });
});

describe('subscription and organization pages', () => {
  it('creates and edits plans, assigns subscriptions and confirms cancellation', async () => {
    const { user } = renderPage(<Subscriptions />, '/subscriptions');
    await screen.findByRole('button', { name: 'Edit Growth plan' });
    await user.click(screen.getByRole('button', { name: 'Create plan' }));
    await user.type(screen.getByLabelText('Plan name'), 'Scale');
    await user.type(screen.getByLabelText('Price (EUR)'), '199.00');
    await user.click(screen.getAllByRole('button', { name: 'Create plan' }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Edit Growth plan' }));
    await user.clear(screen.getByLabelText('Price (EUR)'));
    await user.type(screen.getByLabelText('Price (EUR)'), '89.00');
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Assign subscription' }));
    await screen.findByLabelText('Customer', { exact: true });
    await user.selectOptions(screen.getByLabelText('Customer', { exact: true }), ids.customer);
    await user.selectOptions(screen.getByLabelText('Subscription plan'), ids.plan);
    await user.click(screen.getAllByRole('button', { name: 'Assign subscription' }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Subscription status'), 'active');
    await user.click(screen.getByRole('button', { name: 'View subscription for Ada Lovelace' }));
    await screen.findByRole('heading', { name: 'Subscription details' });
    await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));
    await user.click(screen.getByRole('button', { name: 'Confirm cancellation' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/subscriptions/' + ids.subscription, {
        status: 'cancelled',
      }),
    );
  });
  it('validates and saves organization preferences', async () => {
    const { user } = renderPage(<Settings />, '/settings');
    await user.clear(screen.getByLabelText('Organization name'));
    await user.type(screen.getByLabelText('Organization name'), 'Northstar Labs');
    await user.selectOptions(screen.getByLabelText('Reporting timezone'), 'Asia/Tokyo');
    await user.click(screen.getByRole('button', { name: 'Save preferences' }));
    await screen.findByText('Workspace preferences saved.');
    expect(api.patch).toHaveBeenCalledWith('/organization', {
      name: 'Northstar Labs',
      timezone: 'Asia/Tokyo',
    });
  });
  it('hides admin mutations for a viewer', async () => {
    vi.mocked(api.me).mockResolvedValue({ ...me, role: 'viewer' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['me'], { ...me, role: 'viewer' });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Settings />
          <Transactions />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText('Organization name')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Record simulated payment' }),
    ).not.toBeInTheDocument();
  });
  it('signs in through the actual login page', async () => {
    vi.mocked(api.me).mockRejectedValue(new ApiError(401, 'Please sign in'));
    vi.spyOn(api, 'login').mockResolvedValue(me);
    const { user } = renderPage(
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<p>Signed in workspace</p>} />
      </Routes>,
      '/login',
      false,
    );
    await screen.findByLabelText('Work email');
    await user.type(screen.getByLabelText('Work email'), 'alex@example.com');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'test-password');
    await user.click(screen.getByRole('button', { name: 'Sign in to workspace' }));
    await screen.findByText('Signed in workspace');
  });
  it('lets a verified multi-workspace account choose a membership in the browser', async () => {
    vi.mocked(api.me).mockRejectedValue(new ApiError(401, 'Please sign in'));
    const login = vi
      .spyOn(api, 'login')
      .mockResolvedValueOnce({
        requires_workspace: true,
        workspaces: [
          { id: me.organization.id, name: 'Northstar Studio', role: 'admin' },
          { id: '70000000-0000-4000-8000-000000000001', name: 'Second Studio', role: 'viewer' },
        ],
      })
      .mockResolvedValueOnce({
        ...me,
        role: 'viewer',
        organization: { ...me.organization, name: 'Second Studio' },
      });
    const { user } = renderPage(
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<p>Chosen workspace</p>} />
      </Routes>,
      '/login',
      false,
    );
    await user.type(await screen.findByLabelText('Work email'), 'alex@example.com');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'test-password');
    await user.click(screen.getByRole('button', { name: 'Sign in to workspace' }));
    await user.click(await screen.findByRole('button', { name: 'Second Studio · viewer' }));
    await screen.findByText('Chosen workspace');
    expect(login).toHaveBeenLastCalledWith({
      email: 'alex@example.com',
      password: 'test-password',
      organization_id: '70000000-0000-4000-8000-000000000001',
    });
  });
  it('renders the workspace shell and closes the account menu on Escape', async () => {
    const { user } = renderPage(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="*" element={<p>Workspace content</p>} />
        </Route>
      </Routes>,
    );
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    await user.click(screen.getByRole('button', { name: 'User menu' }));
    expect(screen.getByRole('dialog', { name: 'Account menu' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'User menu' })).toHaveFocus();
  });
});
