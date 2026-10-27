import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Banknote, CreditCard, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { dateLabel, initials, money } from '@/lib/utils';
import type { Analytics, Customer, Page, Subscription, TransactionPage } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge, Empty, ErrorState, Loading } from '@/components/ui/shared';
import { TransactionCards } from '@/components/ui/transaction-cards';
import { useMediaQuery } from '@/hooks/use-media-query';
import { TrendChart } from '@/components/charts/trend-chart';
export function OverviewPanels({ data, timezone }: { data: Analytics; timezone: string }) {
  const isNarrow = useMediaQuery('(max-width: 640px)');
  const recent = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: () => api.get<TransactionPage>('/transactions?page_size=5'),
  });
  const customers = useQuery({
    queryKey: ['customers', 'recent'],
    queryFn: () => api.get<Page<Customer>>('/customers?page_size=4'),
  });
  const subscriptions = useQuery({
    queryKey: ['subscriptions', 'recent'],
    queryFn: () => api.get<Page<Subscription>>('/subscriptions?page_size=4'),
  });
  return (
    <>
      <div className="two-column overview-trends">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Customer growth</h2>
              <p>Every new relationship adds to your story.</p>
            </div>
            <Users size={18} className="muted" />
          </div>
          <TrendChart data={data.trend} metric="customers" />
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Paid transaction volume</h2>
              <p>Collected payments during each reporting interval.</p>
            </div>
            <Banknote size={18} className="muted" />
          </div>
          <TrendChart data={data.trend} metric="paid_cents" />
        </section>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Recent transactions</h2>
            <p>The latest activity across your workspace.</p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/transactions">
              View all transactions
              <ArrowRight size={15} />
            </Link>
          </Button>
        </div>
        {recent.isPending ? (
          <Loading />
        ) : recent.error ? (
          <ErrorState error={recent.error} retry={() => void recent.refetch()} />
        ) : recent.data?.items.length ? (
          <>
            {isNarrow ? (
              <TransactionCards transactions={recent.data.items} timezone={timezone} />
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Reference</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.data.items.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <Link to={'/customers/' + t.customer_id} className="person">
                            <span className="avatar avatar-small">{initials(t.customer_name)}</span>
                            <strong>{t.customer_name}</strong>
                          </Link>
                        </td>
                        <td className="amount">{money(t.amount_cents)}</td>
                        <td>
                          <Badge status={t.status} />
                        </td>
                        <td className="mono muted">{t.external_reference || '—'}</td>
                        <td className="muted">{dateLabel(t.timestamp, timezone)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <Empty title="No transactions yet" />
        )}
      </section>
      <div className="two-column">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Recently added customers</h2>
              <p>The newest faces in your business.</p>
            </div>
            <Button variant="ghost" size="icon" asChild>
              <Link to="/customers" aria-label="View all customers">
                <ArrowUpRightIcon />
              </Link>
            </Button>
          </div>
          {customers.isPending ? (
            <Loading />
          ) : customers.error ? (
            <ErrorState error={customers.error} retry={() => void customers.refetch()} />
          ) : customers.data?.items.length ? (
            <div className="activity-list">
              {customers.data.items.map((c) => (
                <Link key={c.id} to={'/customers/' + c.id} className="activity-row">
                  <span className="avatar">{initials(c.name)}</span>
                  <div>
                    <strong>{c.name}</strong>
                    <small>{c.company || c.email}</small>
                  </div>
                  <span>{dateLabel(c.created_at, timezone)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="No customers yet" />
          )}
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Subscription activity</h2>
              <p>Where your recurring relationships begin.</p>
            </div>
            <Button variant="ghost" size="icon" asChild>
              <Link to="/subscriptions" aria-label="View all subscriptions">
                <ArrowUpRightIcon />
              </Link>
            </Button>
          </div>
          {subscriptions.isPending ? (
            <Loading />
          ) : subscriptions.error ? (
            <ErrorState error={subscriptions.error} retry={() => void subscriptions.refetch()} />
          ) : subscriptions.data?.items.length ? (
            <div className="activity-list">
              {subscriptions.data.items.map((s) => (
                <Link key={s.id} to="/subscriptions" className="activity-row">
                  <span className="activity-icon">
                    <CreditCard size={17} />
                  </span>
                  <div>
                    <strong>{s.customer_name}</strong>
                    <small>
                      {s.plan_name} · {money(s.price_cents)}/
                      {s.interval === 'monthly' ? 'mo' : 'yr'}
                    </small>
                  </div>
                  <Badge status={s.status} />
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="No subscriptions yet" />
          )}
        </section>
      </div>
    </>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={17} style={{ transform: 'rotate(-45deg)' }} />;
}
