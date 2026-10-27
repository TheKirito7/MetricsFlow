import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, params } from '@/lib/api';
import { money } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import type { Customer, Page, Plan, Subscription } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ErrorState, Field, FormError, Loading } from '@/components/ui/shared';
const schema = z.object({
  customer_id: z.uuid('Select a customer'),
  plan_id: z.uuid('Select a plan'),
  status: z.enum(['active', 'trial']),
});
export function SubscriptionForm({
  customer,
  onClose,
}: {
  customer?: Customer;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);
  const customers = useQuery({
    queryKey: ['customers', 'picker', debounced],
    queryFn: () =>
      api.get<Page<Customer>>(
        '/customers' +
          params({
            search: debounced,
            status: 'active',
            page_size: 100,
            sort: 'name',
            order: 'asc',
          }),
      ),
    enabled: !customer,
  });
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api.get<Plan[]>('/plans') });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { customer_id: customer?.id ?? '', plan_id: '', status: 'active' },
  });
  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      api.post<Subscription>('/subscriptions', values),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['subscriptions'] }),
        client.invalidateQueries({ queryKey: ['analytics'] }),
        client.invalidateQueries({ queryKey: ['customers'] }),
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
      title="Assign subscription"
      description="The selected plan’s price and billing interval are saved with this subscription."
    >
      {plans.isPending || (!customer && customers.isPending) ? (
        <Loading />
      ) : plans.error || customers.error ? (
        <ErrorState
          error={(plans.error || customers.error)!}
          retry={() => {
            void plans.refetch();
            if (!customer) void customers.refetch();
          }}
        />
      ) : (
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} noValidate>
          {!customer && (
            <Field
              label="Find customer"
              id="find-customer"
              hint="Search to find any active customer. Up to 100 matches are displayed."
            >
              <input
                id="find-customer"
                placeholder="Search by name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>
          )}
          <Field
            label="Customer"
            id="subscription-customer"
            error={form.formState.errors.customer_id?.message}
          >
            <select id="subscription-customer" {...form.register('customer_id')}>
              <option value="">Select customer</option>
              {customer ? (
                <option value={customer.id}>{customer.name}</option>
              ) : (
                customers.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.email}
                  </option>
                ))
              )}
            </select>
          </Field>
          <Field
            label="Subscription plan"
            id="subscription-plan"
            error={form.formState.errors.plan_id?.message}
          >
            <select id="subscription-plan" {...form.register('plan_id')}>
              <option value="">Select plan</option>
              {plans.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {money(p.price_cents)} / {p.interval === 'monthly' ? 'month' : 'year'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Initial status" id="subscription-status">
            <select id="subscription-status" {...form.register('status')}>
              <option value="active">Active — include in recurring revenue</option>
              <option value="trial">Trial — exclude from recurring revenue</option>
            </select>
          </Field>
          <div className="info-box">
            Assigning a subscription updates MRR. It does not create a payment transaction.
          </div>
          <FormError error={mutation.error} />
          <div className="dialog-actions">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button disabled={mutation.isPending}>
              {mutation.isPending ? 'Assigning…' : 'Assign subscription'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
