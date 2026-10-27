import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDownUp,
  ArrowUpRight,
  CheckCheck,
  CircleDashed,
  CircleX,
  RotateCcw,
} from 'lucide-react';
import { api, params } from '@/lib/api';
import { dateLabel, money } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import type { Transaction, TransactionPage } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge, ErrorState, Loading, PageHeading } from '@/components/ui/shared';
import { DataTable, type TableColumn } from '@/components/ui/data-table';
import { DateRangeControl } from '@/components/ui/date-range';
import { useReportingRange } from '@/hooks/use-reporting-range';
import { pageNumber, useUrlFilters } from '@/hooks/use-url-filters';
import { SimulatedPaymentForm } from './simulated-payment-form';
import { TransactionExport } from '@/components/ui/transaction-export';
import { TransactionCards } from '@/components/ui/transaction-cards';
import { Dialog } from '@/components/ui/dialog';
function TransactionDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: me } = useSession();
  const query = useQuery({
    queryKey: ['transactions', id],
    queryFn: () => api.get<Transaction>('/transactions/' + id),
  });
  const t = query.data;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Transaction details"
      description="A record from your simulated payment ledger."
    >
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        t && (
          <>
            <div className="detail-title">
              <h3>{money(t.amount_cents)}</h3>
              <Badge status={t.status} />
            </div>
            <dl className="definition-list">
              <div>
                <dt>Customer</dt>
                <dd>
                  <Link to={'/customers/' + t.customer_id}>{t.customer_name}</Link>
                </dd>
              </div>
              <div>
                <dt>Currency</dt>
                <dd>{t.currency}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{dateLabel(t.timestamp, me?.organization.timezone)}</dd>
              </div>
              <div>
                <dt>External reference</dt>
                <dd className="mono">{t.external_reference || 'Not provided'}</dd>
              </div>
              <div>
                <dt>Transaction ID</dt>
                <dd className="mono small-text">{t.id}</dd>
              </div>
              <div>
                <dt>Subscription</dt>
                <dd className="mono small-text">{t.subscription_id || 'No linked subscription'}</dd>
              </div>
            </dl>
            <div className="info-box">
              Demo transactions are simulated. No real payment has been processed.
            </div>
          </>
        )
      )}
    </Dialog>
  );
}
export default function Transactions() {
  const { data: me } = useSession();
  const timezone = me?.organization.timezone ?? 'Europe/Lisbon';
  const [searchParams] = useSearchParams();
  const customerId = searchParams.get('customer_id') ?? '';
  const { range, setRange } = useReportingRange(me?.organization.timezone, 30);
  const { values, update } = useUrlFilters({
    status: '',
    sort: 'timestamp',
    order: 'desc',
    page: '1',
  });
  const { status, sort, order } = values;
  const page = pageNumber(values.page);
  const setStatus = (status: string) => update({ status, page: 1 });
  const setSort = (sort: string) => update({ sort, page: 1 });
  const setOrder = (order: string) => update({ order, page: 1 });
  const setPage = (page: number) => update({ page });
  const [simulate, setSimulate] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const filters = { ...range, status, sort, order, customer_id: customerId };
  const query = useQuery({
    queryKey: ['transactions', { ...filters, page }],
    queryFn: () => api.get<TransactionPage>('/transactions' + params({ ...filters, page })),
    enabled: !!me,
  });
  const columns = useMemo<TableColumn<Transaction>[]>(
    () => [
      {
        id: 'customer',
        header: 'Customer',
        cell: ({ row }) => (
          <Link className="text-link" to={'/customers/' + row.original.customer_id}>
            {row.original.customer_name}
          </Link>
        ),
      },
      {
        id: 'reference',
        header: 'Reference',
        cell: ({ row }) => (
          <span className="mono muted">{row.original.external_reference || '—'}</span>
        ),
      },
      {
        id: 'amount',
        header: 'Amount',
        cell: ({ row }) => <strong className="amount">{money(row.original.amount_cents)}</strong>,
      },
      { id: 'status', header: 'Status', cell: ({ row }) => <Badge status={row.original.status} /> },
      {
        id: 'date',
        header: 'Date',
        cell: ({ row }) => (
          <span className="muted">{dateLabel(row.original.timestamp, timezone)}</span>
        ),
      },
      {
        id: 'details',
        header: () => <span className="sr-only">Details</span>,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDetail(row.original.id)}
            aria-label={'View transaction ' + (row.original.external_reference || row.original.id)}
          >
            <ArrowUpRight size={16} />
          </Button>
        ),
      },
    ],
    [timezone, setDetail],
  );
  const summary = query.data?.summary;
  return (
    <>
      <PageHeading
        eyebrow="FOLLOW EVERY PAYMENT"
        title="Transactions"
        description="A transparent ledger of your business activity."
        actions={
          <>
            {me?.role === 'admin' && !me.read_only_demo && (
              <Button onClick={() => setSimulate(true)}>Record simulated payment</Button>
            )}
            <TransactionExport query={params(filters)} />
          </>
        }
      />
      <div className="summary-grid">
        {[
          { label: 'Collected', value: summary?.paid_cents, icon: CheckCheck, status: 'positive' },
          {
            label: 'Pending',
            value: summary?.pending_cents,
            icon: CircleDashed,
            status: 'warning',
          },
          { label: 'Failed', value: summary?.failed_cents, icon: CircleX, status: 'negative' },
          { label: 'Refunded', value: summary?.refunded_cents, icon: RotateCcw, status: 'muted' },
        ].map(({ label, value, icon: Icon, status: color }) => (
          <article key={label} className="summary-card">
            <span className={color}>
              <Icon size={17} />
              {label}
            </span>
            <strong>{value === undefined ? '—' : money(value)}</strong>
            <small>Filtered period total</small>
          </article>
        ))}
      </div>
      <section className="panel">
        <div className="toolbar">
          <DateRangeControl
            value={range}
            onChange={(value) => {
              setRange(value);
            }}
            timezone={timezone}
          />
          <div className="toolbar-controls">
            <select
              aria-label="Transaction status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
              }}
            >
              <option value="">All statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
            <select
              aria-label="Sort transactions"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
              }}
            >
              <option value="timestamp">Date</option>
              <option value="amount_cents">Amount</option>
            </select>
            <Button
              variant="outline"
              size="icon"
              aria-label={'Sort ' + (order === 'asc' ? 'descending' : 'ascending')}
              onClick={() => {
                setOrder(order === 'asc' ? 'desc' : 'asc');
              }}
            >
              <ArrowDownUp size={16} />
            </Button>
          </div>
        </div>
        {customerId && (
          <div className="filter-banner">
            Filtered to one customer.<Link to="/transactions">Clear customer filter</Link>
          </div>
        )}
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          <DataTable
            mobileCards={
              <TransactionCards
                transactions={query.data.items}
                timezone={timezone}
                onDetail={setDetail}
              />
            }
            columns={columns}
            data={query.data.items}
            total={query.data.total}
            page={page}
            onPage={setPage}
          />
        )}
      </section>
      <p className="page-note">
        Paid totals show collected payments. Refunded amounts are reported separately. CSV exports
        include all matching records.
      </p>
      {detail && <TransactionDetail id={detail} onClose={() => setDetail(null)} />}
      {simulate && <SimulatedPaymentForm onClose={() => setSimulate(false)} />}
    </>
  );
}
