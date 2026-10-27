import type { Me, WorkspaceSelection } from '@/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
let csrfToken = '';
const base = '/api/v1';
export const params = (values: Record<string, string | number | undefined>) => {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== '') result.set(key, String(value));
  return result.toString() ? `?${result}` : '';
};
async function fetchResponse(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(base + path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, ...init?.headers },
  });
  if (!response.ok) {
    let message = 'Unable to reach MetricsFlow. Please try again.';
    try {
      const body: { detail?: string } = await response.json();
      if (typeof body.detail === 'string') message = body.detail;
    } catch {
      /* Non-JSON upstream response. */
    }
    if (response.status === 401 && !path.startsWith('/auth/login'))
      window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(response.status, message);
  }
  return response;
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchResponse(path, init);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
  me: async () => {
    const me = await request<Me>('/me');
    csrfToken = me.csrf_token;
    return me;
  },
  login: async (data: { email: string; password: string; organization_id?: string }) => {
    const me = await request<Me | WorkspaceSelection>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!('requires_workspace' in me)) csrfToken = me.csrf_token;
    return me;
  },
  logout: async () => {
    await request<void>('/auth/logout', { method: 'POST' });
    csrfToken = '';
  },
  downloadTransactions: async (query: string) => {
    const response = await fetchResponse('/reports/transactions.csv' + query);
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = 'metricsflow-transactions.csv';
    document.body.append(link);
    link.click();
    link.remove();
    // Allow the browser to consume the object URL before releasing it.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
