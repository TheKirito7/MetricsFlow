import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CustomerForm, customerSchema } from '@/features/customers/customer-form';
import { loginSchema } from '@/features/auth/login';
function form() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <CustomerForm onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}
describe('customer form', () => {
  it('validates inputs and focuses the first invalid field', async () => {
    const user = userEvent.setup();
    form();
    await user.click(screen.getByRole('button', { name: 'Create customer' }));
    expect(await screen.findByText('Enter a customer name')).toBeVisible();
    expect(screen.getByText('Enter a valid email address')).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText('Full name')).toHaveFocus());
  });
  it('submits valid data to the real API boundary and handles server errors', async () => {
    const user = userEvent.setup();
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Email already in use' }), { status: 409 }),
      );
    form();
    await user.type(screen.getByLabelText('Full name'), 'Sofia Silva');
    await user.type(screen.getByLabelText('Email address'), 'sofia@example.com');
    await user.click(screen.getByRole('button', { name: 'Create customer' }));
    expect(await screen.findByText('Email already in use')).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/customers',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          name: 'Sofia Silva',
          email: 'sofia@example.com',
          company: '',
          status: 'active',
        }),
      }),
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Add customer');
  });
  it('rejects blank names and invalid email at schema boundary', () => {
    expect(
      customerSchema.safeParse({ name: ' ', email: 'bad', company: '', status: 'active' }).success,
    ).toBe(false);
    expect(loginSchema.safeParse({ email: 'bad', password: '' }).success).toBe(false);
  });
});
