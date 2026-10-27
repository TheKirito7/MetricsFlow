import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { useReportingRange } from '@/hooks/use-reporting-range';
import { me, analytics, customer, ledger, plan, subscription } from './fixtures';

describe('route boundaries and timezone initialization', () => {
  it('derives the default date from a newly loaded organization timezone', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T23:30:00Z'));
    function Probe({ timezone }: { timezone?: string }) {
      const { range } = useReportingRange(timezone, 7);
      return <output>{range.end_date}</output>;
    }
    const view = render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('2026-10-27');
    view.rerender(
      <MemoryRouter>
        <Probe timezone="Asia/Tokyo" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('2026-10-28');
    vi.useRealTimers();
  });
  it('keeps unknown routes visible and navigates into the real lazy-loaded workspace', async () => {
    window.history.replaceState(null, '', '/unknown-report');
    vi.spyOn(api, 'me').mockResolvedValue(me);
    vi.spyOn(api, 'get').mockImplementation(async function <T>(path: string): Promise<T> {
      const values: Record<string, unknown> = {
        '/analytics/overview': analytics,
        '/customers': { items: [customer], total: 1, page: 1, page_size: 20 },
        '/subscriptions': { items: [subscription], total: 1, page: 1, page_size: 20 },
        '/plans': [plan],
        '/transactions': ledger,
      };
      return structuredClone(values[path.split('?')[0]]) as T;
    });
    const { App } = await import('@/app/router');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['me'], me);
    render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { name: 'Page not found' });
    expect(window.location.pathname).toBe('/unknown-report');
    expect(document.title).toBe('Page not found · MetricsFlow');
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Back to overview' }));
    await screen.findByTestId('mrr-value');
    await waitFor(() => expect(document.title).toBe('Overview · MetricsFlow'));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['me'] });
    });
  });
});
