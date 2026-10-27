import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { dateLabel, money } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import type { Subscription, SubscriptionDetail as Detail } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Empty, ErrorState, FormError, Loading } from '@/components/ui/shared';
export function SubscriptionDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: me } = useSession();
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const timezone = me?.organization.timezone;
  const query = useQuery({
    queryKey: ['subscriptions', id],
    queryFn: () => api.get<Detail>('/subscriptions/' + id),
  });
  const mutation = useMutation({
    mutationFn: (status: 'active' | 'cancelled' | 'expired') =>
      api.patch<Subscription>('/subscriptions/' + id, { status }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['subscriptions'] }),
        client.invalidateQueries({ queryKey: ['analytics'] }),
        client.invalidateQueries({ queryKey: ['customers'] }),
      ]);
      setConfirm(false);
    },
  });
  const sub = query.data;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
      title="Subscription details"
      description="An immutable billing snapshot and a full lifecycle history."
    >
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        sub && (
          <>
            <div className="detail-title">
              <h3>{sub.plan_name}</h3>
              <Badge status={sub.status} />
            </div>
            <dl className="definition-list">
              <div>
                <dt>Customer</dt>
                <dd>
                  <Link to={'/customers/' + sub.customer_id}>{sub.customer_name}</Link>
                </dd>
              </div>
              <div>
                <dt>Price snapshot</dt>
                <dd>
                  {money(sub.price_cents)} / {sub.interval === 'monthly' ? 'month' : 'year'}
                </dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{dateLabel(sub.started_at, timezone)}</dd>
              </div>
              <div>
                <dt>Activated</dt>
                <dd>
                  {sub.activated_at ? dateLabel(sub.activated_at, timezone) : 'Not activated'}
                </dd>
              </div>
              {sub.ends_at && (
                <div>
                  <dt>Effective end</dt>
                  <dd>
                    {new Intl.DateTimeFormat('en-GB', {
                      dateStyle: 'medium',
                      timeStyle: 'medium',
                      timeZone: timezone,
                    }).format(new Date(sub.ends_at + 'Z'))}
                  </dd>
                </div>
              )}
            </dl>
            <h4 className="section-label">ACTIVITY HISTORY</h4>
            {sub.activity.length ? (
              <div className="timeline">
                {sub.activity.map((a) => (
                  <div key={a.id}>
                    <span className="timeline-dot" />
                    <div>
                      <strong>{a.action.replaceAll('.', ' ')}</strong>
                      <small>{dateLabel(a.timestamp, timezone)}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="No recorded events" />
            )}
            <FormError error={mutation.error} />
            {me?.role === 'admin' &&
              !me.read_only_demo &&
              ['active', 'trial'].includes(sub.status) && (
                <div className="subscription-actions">
                  {sub.status === 'trial' && (
                    <>
                      <Button
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate('active')}
                      >
                        Activate subscription
                      </Button>
                      <Button
                        variant="outline"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate('expired')}
                      >
                        End trial
                      </Button>
                    </>
                  )}
                  {!confirm ? (
                    <Button variant="destructive" onClick={() => setConfirm(true)}>
                      Cancel subscription
                    </Button>
                  ) : (
                    <div className="cancel-confirm">
                      <p>
                        Cancellation takes effect immediately. MRR will update; historical records
                        are retained.
                      </p>
                      <div>
                        <Button
                          variant="outline"
                          disabled={mutation.isPending}
                          onClick={() => setConfirm(false)}
                        >
                          Keep subscription
                        </Button>
                        <Button
                          variant="destructive"
                          disabled={mutation.isPending}
                          onClick={() => mutation.mutate('cancelled')}
                        >
                          {mutation.isPending ? 'Cancelling…' : 'Confirm cancellation'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
          </>
        )
      )}
    </Dialog>
  );
}
