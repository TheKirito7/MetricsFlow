import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CreditCard, Pencil, Plus } from 'lucide-react';
import { api, params } from '@/lib/api';
import { dateLabel, money } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { pageNumber, useUrlFilters } from '@/hooks/use-url-filters';
import type { Page, Plan, Subscription } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge, Empty, ErrorState, Loading, PageHeading } from '@/components/ui/shared';
import { DataTable, type TableColumn } from '@/components/ui/data-table';
import { PlanForm } from './plan-form';
import { SubscriptionForm } from './subscription-form';
import { SubscriptionDetail } from './subscription-detail';
export default function Subscriptions() {
  const { data: me } = useSession();
  const { values, update } = useUrlFilters({ status: '', page: '1' });
  const status = values.status;
  const page = pageNumber(values.page);
  const setStatus = (status: string) => update({ status, page: 1 });
  const setPage = (page: number) => update({ page });
  const [assign, setAssign] = useState(false);
  const [planEdit, setPlanEdit] = useState<Plan | 'new' | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const timezone = me?.organization.timezone;
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api.get<Plan[]>('/plans') });
  const query = useQuery({
    queryKey: ['subscriptions', { status, page }],
    queryFn: () => api.get<Page<Subscription>>('/subscriptions' + params({ status, page })),
  });
  const columns = useMemo<TableColumn<Subscription>[]>(
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
      { accessorKey: 'plan_name', header: 'Plan' },
      {
        id: 'price',
        header: 'Price snapshot',
        cell: ({ row }) => (
          <>
            {money(row.original.price_cents)}
            <span className="muted"> / {row.original.interval === 'monthly' ? 'mo' : 'yr'}</span>
          </>
        ),
      },
      { id: 'status', header: 'Status', cell: ({ row }) => <Badge status={row.original.status} /> },
      {
        id: 'started',
        header: 'Started',
        cell: ({ row }) => (
          <span className="muted">{dateLabel(row.original.started_at, timezone)}</span>
        ),
      },
      {
        id: 'details',
        header: () => <span className="sr-only">Details</span>,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            aria-label={'View subscription for ' + row.original.customer_name}
            onClick={() => setDetail(row.original.id)}
          >
            <ArrowUpRight size={16} />
          </Button>
        ),
      },
    ],
    [timezone, setDetail],
  );
  return (
    <>
      <PageHeading
        eyebrow="BUILT FOR RECURRING GROWTH"
        title="Subscriptions"
        description="Good plans. Lasting relationships. Predictable revenue."
        actions={
          me?.role === 'admin' &&
          !me.read_only_demo && (
            <Button onClick={() => setAssign(true)}>
              <Plus size={16} />
              Assign subscription
            </Button>
          )
        }
      />
      <div className="section-heading">
        <h2>Your plans</h2>
        {me?.role === 'admin' && !me.read_only_demo && (
          <Button variant="ghost" size="sm" onClick={() => setPlanEdit('new')}>
            <Plus size={15} />
            Create plan
          </Button>
        )}
      </div>
      {plans.isPending ? (
        <Loading />
      ) : plans.error ? (
        <ErrorState error={plans.error} retry={() => void plans.refetch()} />
      ) : !plans.data.length ? (
        <Empty
          title="Create your first plan"
          description="Plans define pricing for new subscriptions."
        />
      ) : (
        <div className="plan-grid">
          {plans.data.map((p, i) => (
            <article className={'plan-card plan-color-' + (i % 4)} key={p.id}>
              <div>
                <span className="plan-card-icon">
                  <CreditCard size={17} />
                </span>
                {me?.role === 'admin' && !me.read_only_demo && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPlanEdit(p)}
                    aria-label={'Edit ' + p.name + ' plan'}
                  >
                    <Pencil size={14} />
                  </Button>
                )}
              </div>
              <h3>{p.name}</h3>
              <strong>
                {money(p.price_cents, true)}
                <small> / {p.interval === 'monthly' ? 'month' : 'year'}</small>
              </strong>
              <p>
                {p.interval === 'yearly'
                  ? money(Math.round(p.price_cents / 12)) + ' normalized monthly'
                  : 'Billed monthly · EUR'}
              </p>
            </article>
          ))}
        </div>
      )}
      <section className="panel">
        <div className="list-title">
          <h2>
            All subscriptions <span className="count-badge">{query.data?.total ?? '…'}</span>
          </h2>
          <label>
            <span className="sr-only">Subscription status</span>
            <select
              aria-label="Subscription status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
              }}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
            </select>
          </label>
        </div>
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            data={query.data.items}
            total={query.data.total}
            page={page}
            onPage={setPage}
          />
        )}
      </section>
      <p className="page-note">
        Prices are stored as immutable snapshots. Editing a plan never changes existing
        subscriptions.
      </p>
      {assign && <SubscriptionForm onClose={() => setAssign(false)} />}{' '}
      {planEdit && (
        <PlanForm
          plan={planEdit === 'new' ? undefined : planEdit}
          onClose={() => setPlanEdit(null)}
        />
      )}{' '}
      {detail && <SubscriptionDetail id={detail} onClose={() => setDetail(null)} />}
    </>
  );
}
