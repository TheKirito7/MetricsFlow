import { Link } from 'react-router-dom';
import type { Transaction } from '@/types';
import { dateLabel, money } from '@/lib/utils';
import { Badge } from './shared';
import { Button } from './button';

export function TransactionCards({
  transactions,
  timezone,
  onDetail,
}: {
  transactions: Transaction[];
  timezone: string;
  onDetail?: (id: string) => void;
}) {
  return (
    <ul className="transaction-cards" aria-label="Transactions">
      {transactions.map((transaction) => (
        <li key={transaction.id}>
          <div>
            <Link className="text-link" to={'/customers/' + transaction.customer_id}>
              {transaction.customer_name}
            </Link>
            <strong>{money(transaction.amount_cents)}</strong>
          </div>
          <div>
            <span className="muted">{dateLabel(transaction.timestamp, timezone)}</span>
            <Badge status={transaction.status} />
          </div>
          <div>
            <span className="mono muted">{transaction.external_reference || 'No reference'}</span>
            {onDetail && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDetail(transaction.id)}
                aria-label={
                  'View transaction ' + (transaction.external_reference || transaction.id)
                }
              >
                Details
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
