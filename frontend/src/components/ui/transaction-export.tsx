import { useMutation } from '@tanstack/react-query';
import { ArrowDownToLine } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from './button';
import { FormError } from './shared';

export function TransactionExport({
  query,
  label = 'Export CSV',
}: {
  query: string;
  label?: string;
}) {
  const mutation = useMutation({ mutationFn: () => api.downloadTransactions(query) });
  return (
    <div className="export-control">
      <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        <ArrowDownToLine size={16} />
        {mutation.isPending ? 'Exporting…' : label}
      </Button>
      <FormError error={mutation.error} />
    </div>
  );
}
