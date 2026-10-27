import { describe, expect, it, vi } from 'vitest';
import { api, ApiError, params } from '@/lib/api';
import { daysBefore, growth, money, utcDate } from '@/lib/utils';
import { planLabel } from '@/lib/plan-label';
describe('typed API client', () => {
  it('surfaces the CSV limit as a friendly error before downloading', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ detail: 'Narrow your filters to export at most 50,000 transactions' }),
        { status: 422 },
      ),
    );
    await expect(api.downloadTransactions('?status=paid')).rejects.toEqual(
      new ApiError(422, 'Narrow your filters to export at most 50,000 transactions'),
    );
  });
  it('downloads successful CSV responses using an authenticated request', async () => {
    vi.useFakeTimers();
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('id,amount_cents\n1,7900'));
    const create = vi.fn(() => 'blob:report');
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = create;
        static revokeObjectURL = vi.fn();
      },
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await api.downloadTransactions('?status=paid');
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/reports/transactions.csv?status=paid',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(click).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(expect.any(Blob));
    vi.runAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('keeps session in cookies and supplies CSRF for mutations', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrf_token: 'csrf-test' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'customer-id' })));
    await api.login({ email: 'admin@example.com', password: 'test-password' });
    await api.post('/customers', { name: 'Sofia' });
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/v1/customers',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-test' }),
      }),
    );
  });
  it('returns a useful typed error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Administrator permissions required' }), {
        status: 403,
      }),
    );
    await expect(api.post('/plans', {})).rejects.toEqual(
      new ApiError(403, 'Administrator permissions required'),
    );
  });
  it('encodes filters without losing zero values', () => {
    expect(params({ search: 'a+b@example.com', page: 0, status: '' })).toBe(
      '?search=a%2Bb%40example.com&page=0',
    );
  });
});
describe('report formatting', () => {
  it('distinguishes duplicate plan names with stable plan identities', () => {
    const first = {
      plan_id: 'aaaaaaaa-0000-4000-8000-000000000001',
      name: 'Growth',
      subscriptions: 1,
      mrr_cents: 100,
      paid_cents: 100,
    };
    const second = { ...first, plan_id: 'bbbbbbbb-0000-4000-8000-000000000002' };
    expect(planLabel(first, [first])).toBe('Growth');
    expect(planLabel(first, [first, second])).toContain('aaaaaaaa');
    expect(planLabel(second, [first, second])).toContain('bbbbbbbb');
  });
  it('formats EUR without floating point storage assumptions', () => {
    expect(money(7900)).toBe('€79.00');
    expect(growth(200, 100)).toBe(100);
    expect(growth(200, 0)).toBeNull();
  });
  it('interprets API timestamps as UTC and handles leap days', () => {
    expect(utcDate('2026-01-01T12:00:00').toISOString()).toBe('2026-01-01T12:00:00.000Z');
    expect(daysBefore('2024-03-01', 1)).toBe('2024-02-29');
  });
});
