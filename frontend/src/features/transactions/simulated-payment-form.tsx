import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, params } from '@/lib/api';
import { money } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import type { Customer, Page, Subscription, Transaction } from '@/types';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ErrorState, Field, FormError, Loading } from '@/components/ui/shared';

const schema = z.object({
  customer_id: z.uuid('Choose a customer'),
  subscription_id: z.uuid('Choose an active subscription'),
});
export function SimulatedPaymentForm({ onClose }: { onClose: () => void }) {
  const client = useQueryClient();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { customer_id: '', subscription_id: '' },
  });
  const customerId = useWatch({ control: form.control, name: 'customer_id' });
  const subscriptionId = useWatch({ control: form.control, name: 'subscription_id' });
  const customers = useQuery({
    queryKey: ['customers', 'payment-picker', debounced],
    queryFn: () =>
      api.get<Page<Customer>>(
        '/customers' + params({ search: debounced, page_size: 100, sort: 'name', order: 'asc' }),
      ),
  });
  const subscriptions = useQuery({
    queryKey: ['subscriptions', 'payment-picker', customerId],
    queryFn: () =>
      api.get<Page<Subscription>>(
        '/subscriptions' + params({ customer_id: customerId, status: 'active', page_size: 100 }),
      ),
    enabled: !!customerId,
  });
  const selected = useMemo(
    () => subscriptions.data?.items.find((s) => s.id === subscriptionId),
    [subscriptions.data, subscriptionId],
  );
  const mutation = useMutation({
    mutationFn: (value: z.infer<typeof schema>) =>
      api.post<Transaction>('/transactions/simulate', {
        subscription_id: value.subscription_id,
        idempotency_key: key,
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['transactions'] }),
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
      title="Record simulated payment"
      description="Create a fictional paid ledger entry. No real payment is processed or charged."
    >
      <form onSubmit={form.handleSubmit((value) => mutation.mutate(value))} noValidate>
        <Field
          label="Find customer"
          id="payment-search"
          hint="Search by name or email. Up to 100 matches are displayed."
        >
          <input
            id="payment-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customers"
          />
        </Field>
        {customers.isPending ? (
          <Loading />
        ) : customers.error ? (
          <ErrorState error={customers.error} retry={() => void customers.refetch()} />
        ) : (
          <Field
            label="Customer"
            id="payment-customer"
            error={form.formState.errors.customer_id?.message}
          >
            <select
              id="payment-customer"
              {...form.register('customer_id', {
                onChange: () => {
                  form.setValue('subscription_id', '');
                  setKey(crypto.randomUUID());
                  mutation.reset();
                },
              })}
              disabled={mutation.isPending}
            >
              <option value="">Choose customer</option>
              {customers.data.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.email}
                </option>
              ))}
            </select>
          </Field>
        )}
        {customerId &&
          (subscriptions.isPending ? (
            <Loading />
          ) : subscriptions.error ? (
            <ErrorState error={subscriptions.error} retry={() => void subscriptions.refetch()} />
          ) : (
            <Field
              label="Active subscription"
              id="payment-subscription"
              error={form.formState.errors.subscription_id?.message}
            >
              <select
                id="payment-subscription"
                disabled={mutation.isPending}
                {...form.register('subscription_id', {
                  onChange: () => {
                    setKey(crypto.randomUUID());
                    mutation.reset();
                  },
                })}
              >
                <option value="">Choose subscription</option>
                {subscriptions.data?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.plan_name} · {money(s.price_cents)} /{' '}
                    {s.interval === 'monthly' ? 'month' : 'year'}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        <div className="info-box">
          {selected
            ? `${money(selected.price_cents)} will be recorded as a simulated paid transaction using the subscription’s price snapshot.`
            : 'Choose an active subscription to preview the amount.'}{' '}
          Recurring revenue is unchanged. Retrying this submission cannot record the same payment
          twice.
        </div>
        <FormError error={mutation.error} />
        <div className="dialog-actions">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending}>
            {mutation.isPending ? 'Recording…' : 'Record simulated payment'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
