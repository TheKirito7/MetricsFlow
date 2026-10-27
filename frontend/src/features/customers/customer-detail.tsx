import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, Building2, CalendarDays, Mail, Pencil, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { dateLabel, initials, money } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import type { CustomerDetail as Detail } from '@/types';
import { Badge, Empty, ErrorState, FormError, Loading, PageHeading } from '@/components/ui/shared';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { CustomerForm } from './customer-form';
import { SubscriptionForm } from '@/features/subscriptions/subscription-form';
export default function CustomerDetail() {
  const { id } = useParams();
  const { data: me } = useSession();
  const client = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [archive, setArchive] = useState(false);
  const [subscribe, setSubscribe] = useState(false);
  const timezone = me?.organization.timezone;
  const query = useQuery({
    queryKey: ['customers', id],
    queryFn: () => api.get<Detail>('/customers/' + id),
  });
  const mutation = useMutation({
    mutationFn: () => api.delete('/customers/' + id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['customers'] });
      setArchive(false);
    },
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  const customer = query.data;
  return (
    <>
      <Link to="/customers" className="back-link">
        <ArrowLeft size={15} />
        Back to customers
      </Link>
      <PageHeading
        title={customer.name}
        description="A complete view of this customer relationship."
        actions={
          me?.role === 'admin' &&
          !me.read_only_demo && (
            <>
              <Button variant="outline" onClick={() => setEdit(true)}>
                <Pencil size={15} />
                Edit customer
              </Button>
              {customer.status !== 'archived' && (
                <Button variant="outline" onClick={() => setArchive(true)}>
                  <Archive size={15} />
                  Archive
                </Button>
              )}
            </>
          )
        }
      />
      <div className="detail-grid">
        <section className="panel profile-card">
          <span className="avatar avatar-large">{initials(customer.name)}</span>
          <h2>{customer.name}</h2>
          <Badge status={customer.status} />
          <div className="profile-info">
            <span>
              <Mail size={16} />
              {customer.email}
            </span>
            <span>
              <Building2 size={16} />
              {customer.company || 'No company added'}
            </span>
            <span>
              <CalendarDays size={16} />
              Joined {dateLabel(customer.created_at, timezone)}
            </span>
          </div>
          <small className="mono muted">ID {customer.id}</small>
        </section>
        <div className="detail-content">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Subscriptions</h2>
                <p>Latest 50 subscriptions and their current status.</p>
              </div>
              {me?.role === 'admin' && !me.read_only_demo && customer.status === 'active' && (
                <Button size="sm" onClick={() => setSubscribe(true)}>
                  <Plus size={15} />
                  Assign subscription
                </Button>
              )}
            </div>
            {customer.subscriptions.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Price snapshot</th>
                      <th>Status</th>
                      <th>Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customer.subscriptions.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.plan_name}</strong>
                        </td>
                        <td>
                          {money(s.price_cents)}/{s.interval === 'monthly' ? 'mo' : 'yr'}
                        </td>
                        <td>
                          <Badge status={s.status} />
                        </td>
                        <td>{dateLabel(s.started_at, timezone)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="No subscriptions yet"
                description="Assign a plan to begin this customer’s subscription."
              />
            )}
          </section>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Transaction history</h2>
                <p>Latest 50 transactions. Historical records are retained.</p>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link to={'/transactions?customer_id=' + customer.id}>Full ledger</Link>
              </Button>
            </div>
            {customer.transactions.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customer.transactions.map((t) => (
                      <tr key={t.id}>
                        <td className="mono">{t.external_reference || t.id.slice(0, 8)}</td>
                        <td>{money(t.amount_cents)}</td>
                        <td>
                          <Badge status={t.status} />
                        </td>
                        <td>{dateLabel(t.timestamp, timezone)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title="No transactions yet"
                description="Simulated and recorded payments will appear here."
              />
            )}
          </section>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Account activity</h2>
                <p>Recent changes to this customer’s profile.</p>
              </div>
            </div>
            {customer.activity.length ? (
              <div className="timeline">
                {customer.activity.map((a) => (
                  <div key={a.id}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>{a.action.replaceAll('.', ' ').replaceAll('_', ' ')}</strong>
                      <small>{dateLabel(a.timestamp, timezone)}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="No recorded activity" />
            )}
          </section>
        </div>
      </div>
      {edit && <CustomerForm customer={customer} onClose={() => setEdit(false)} />}{' '}
      {subscribe && <SubscriptionForm customer={customer} onClose={() => setSubscribe(false)} />}
      <Dialog
        open={archive}
        onOpenChange={setArchive}
        title="Archive this customer?"
        description="Their subscriptions, transactions and history will be retained. Archiving does not cancel active subscriptions."
      >
        <FormError error={mutation.error} />
        <div className="dialog-actions">
          <Button variant="outline" disabled={mutation.isPending} onClick={() => setArchive(false)}>
            Keep customer
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Archiving…' : 'Archive customer'}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
