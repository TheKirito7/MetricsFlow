import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Plan } from '@/types';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, FormError } from '@/components/ui/shared';
const schema = z.object({
  name: z.string().trim().min(1, 'Enter a plan name').max(80),
  price: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Use a positive price with up to 2 decimal places')
    .refine(
      (v) => Number(v) > 0 && Number(v) <= 1_000_000,
      'Price must be between €0.01 and €1,000,000',
    ),
  interval: z.enum(['monthly', 'yearly']),
});
export function PlanForm({ plan, onClose }: { plan?: Plan; onClose: () => void }) {
  const client = useQueryClient();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: plan?.name ?? '',
      price: plan ? (plan.price_cents / 100).toFixed(2) : '',
      interval: plan?.interval ?? 'monthly',
    },
  });
  const mutation = useMutation({
    mutationFn: (v: z.infer<typeof schema>) => {
      const data = {
        name: v.name,
        price_cents: Math.round(Number(v.price) * 100),
        interval: v.interval,
      };
      return plan ? api.patch<Plan>('/plans/' + plan.id, data) : api.post<Plan>('/plans', data);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['plans'] });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
      title={plan ? 'Edit plan' : 'Create plan'}
      description="Plan changes apply to future subscriptions. Existing subscriptions keep their original price."
    >
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} noValidate>
        <Field label="Plan name" id="plan-name" error={form.formState.errors.name?.message}>
          <input id="plan-name" placeholder="e.g. Growth" {...form.register('name')} />
        </Field>
        <div className="form-row">
          <Field label="Price (EUR)" id="plan-price" error={form.formState.errors.price?.message}>
            <input
              id="plan-price"
              inputMode="decimal"
              placeholder="79.00"
              {...form.register('price')}
            />
          </Field>
          <Field label="Billing interval" id="plan-interval">
            <select id="plan-interval" {...form.register('interval')}>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </Field>
        </div>
        <FormError error={mutation.error} />
        <div className="dialog-actions">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : plan ? 'Save plan' : 'Create plan'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
