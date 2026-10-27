import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import type { Customer } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, FormError } from '@/components/ui/shared';
export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Enter a customer name').max(120),
  email: z.email('Enter a valid email address'),
  company: z.string().max(160),
  status: z.enum(['active', 'archived']),
});
type Values = z.infer<typeof customerSchema>;
export function CustomerForm({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
  const client = useQueryClient();
  const form = useForm<Values>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: customer?.name ?? '',
      email: customer?.email ?? '',
      company: customer?.company ?? '',
      status: customer?.status ?? 'active',
    },
  });
  const mutation = useMutation({
    mutationFn: (values: Values) =>
      customer
        ? api.patch<Customer>('/customers/' + customer.id, values)
        : api.post<Customer>('/customers', values),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['customers'] }),
        client.invalidateQueries({ queryKey: ['analytics'] }),
        client.invalidateQueries({ queryKey: ['subscriptions'] }),
        client.invalidateQueries({ queryKey: ['transactions'] }),
      ]);
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
      title={customer ? 'Edit customer' : 'Add customer'}
      description={
        customer
          ? 'Keep this customer’s information up to date.'
          : 'Start a new relationship. Add their details below.'
      }
    >
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} noValidate>
        <Field label="Full name" id="customer-name" error={form.formState.errors.name?.message}>
          <input
            id="customer-name"
            autoComplete="name"
            placeholder="e.g. Sofia Silva"
            aria-invalid={!!form.formState.errors.name}
            {...form.register('name')}
          />
        </Field>
        <Field
          label="Email address"
          id="customer-email"
          error={form.formState.errors.email?.message}
        >
          <input
            id="customer-email"
            type="email"
            autoComplete="email"
            placeholder="sofia@company.com"
            aria-invalid={!!form.formState.errors.email}
            {...form.register('email')}
          />
        </Field>
        <Field
          label="Company (optional)"
          id="customer-company"
          error={form.formState.errors.company?.message}
        >
          <input
            id="customer-company"
            autoComplete="organization"
            placeholder="Company name"
            {...form.register('company')}
          />
        </Field>
        {customer && (
          <Field label="Status" id="customer-status">
            <select id="customer-status" {...form.register('status')}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        )}
        <FormError error={mutation.error} />
        <div className="dialog-actions">
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : customer ? 'Save changes' : 'Create customer'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
