import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  CalendarRange,
  CreditCard,
  Info,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { api, params } from '@/lib/api';
import { dateLabel, growth, money, number } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import type { Analytics } from '@/types';
import { Button } from '@/components/ui/button';
import { Change, Empty, ErrorState, Loading, PageHeading } from '@/components/ui/shared';
import { TransactionExport } from '@/components/ui/transaction-export';
import { DateRangeControl } from '@/components/ui/date-range';
import { useReportingRange } from '@/hooks/use-reporting-range';
import { TrendChart } from '@/components/charts/trend-chart';
import { OverviewPanels } from './overview-panels';
import { AnalyticsPanels } from '@/features/analytics/analytics-panels';
import { PlanChart } from '@/components/charts/plan-chart';
export default function Dashboard({ analytics = false }: { analytics?: boolean }) {
  const { data: me } = useSession();
  const timezone = me?.organization.timezone ?? 'Europe/Lisbon';
  const { range, setRange } = useReportingRange(me?.organization.timezone);
  const [metric, setMetric] = useState<'mrr_cents' | 'paid_cents'>('mrr_cents');
  const query = useQuery({
    queryKey: ['analytics', range, timezone],
    queryFn: () => api.get<Analytics>('/analytics/overview' + params(range)),
    enabled: !!me,
  });
  const data = query.data;
  const cards = data
    ? [
        {
          label: 'Monthly recurring revenue',
          value: money(data.current.mrr_cents, true),
          change: growth(data.current.mrr_cents, data.previous.mrr_cents),
          icon: Wallet,
          note: 'Snapshot MRR',
        },
        {
          label: 'Annual recurring revenue',
          value: money(data.current.arr_cents, true),
          change: growth(data.current.arr_cents, data.previous.arr_cents),
          icon: CalendarRange,
          note: 'MRR × 12',
        },
        {
          label: 'Active subscriptions',
          value: number(data.current.active_subscriptions),
          change: growth(data.current.active_subscriptions, data.previous.active_subscriptions),
          icon: CreditCard,
          note: 'At snapshot date',
        },
        {
          label: 'Active paying customers',
          value: number(data.current.paying_customers),
          change: growth(data.current.paying_customers, data.previous.paying_customers),
          icon: UserCheck,
          note: 'Unique subscribers',
        },
        {
          label: 'Customer churn rate',
          value: data.churn_percent.toFixed(2) + '%',
          change: undefined,
          icon: Users,
          note: 'Lost from starting cohort',
        },
        {
          label: 'Average revenue per user',
          value: money(data.current.arpu_cents),
          change: growth(data.current.arpu_cents, data.previous.arpu_cents),
          icon: Banknote,
          note: 'MRR / paying customers',
        },
      ]
    : [];
  return (
    <>
      <PageHeading
        eyebrow={analytics ? 'THE BIGGER PICTURE' : 'YOUR BUSINESS, AT A GLANCE'}
        title={analytics ? 'Analytics' : 'Overview'}
        description={
          analytics
            ? 'Understand the patterns behind your growth.'
            : 'A little clarity for your next big decision.'
        }
        actions={
          <>
            <DateRangeControl value={range} onChange={setRange} timezone={timezone} />
            <TransactionExport query={params(range)} label="Export transactions" />
          </>
        }
      />
      {query.isPending ? (
        <Loading label="Calculating your business metrics…" />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        data && (
          <>
            <div className="reporting-context">
              <span>Demo workspace · simulated billing data</span>
              <span>
                <Info size={13} /> Snapshot {dateLabel(data.snapshot_at, timezone)} · Period{' '}
                {dateLabel(data.start_date + 'T12:00:00', timezone)} –{' '}
                {dateLabel(data.end_date + 'T12:00:00', timezone)} · {timezone}
              </span>
            </div>
            <section className="kpi-grid" aria-label="Business metrics">
              {cards.map(({ label, value, change, icon: Icon, note }, i) => (
                <article className={'kpi-card' + (i === 0 ? ' kpi-featured' : '')} key={label}>
                  <div className="kpi-top">
                    <h2>{label}</h2>
                    <span className="metric-icon">
                      <Icon size={17} />
                    </span>
                  </div>
                  <strong className="kpi-value" data-testid={i === 0 ? 'mrr-value' : undefined}>
                    {value}
                  </strong>
                  {change === undefined ? (
                    <span className="comparison">
                      <span className="neutral-tag">{note}</span>
                      <span>selected period</span>
                    </span>
                  ) : (
                    <Change
                      value={change}
                      label="since period start"
                      available={data.snapshot_comparison_available}
                    />
                  )}
                </article>
              ))}
            </section>
            <div className="chart-grid">
              <section className="panel revenue-panel">
                <div className="panel-header">
                  <div>
                    <h2>
                      {metric === 'mrr_cents' ? 'Recurring revenue' : 'Collected revenue'}
                      <span className="subtle-pill">{metric === 'mrr_cents' ? 'MRR' : 'PAID'}</span>
                    </h2>
                    <p>
                      {metric === 'mrr_cents'
                        ? 'Your growth, one reporting interval at a time.'
                        : 'Successful payments received during the selected period.'}
                    </p>
                  </div>
                  <div className="segmented" aria-label="Revenue chart metric">
                    <button
                      aria-pressed={metric === 'mrr_cents'}
                      onClick={() => setMetric('mrr_cents')}
                    >
                      Recurring
                    </button>
                    <button
                      aria-pressed={metric === 'paid_cents'}
                      onClick={() => setMetric('paid_cents')}
                    >
                      Collected
                    </button>
                  </div>
                </div>
                <div className="chart-headline">
                  <strong>
                    {money(metric === 'mrr_cents' ? data.current.mrr_cents : data.paid_cents)}
                  </strong>
                  <Change
                    label={metric === 'mrr_cents' ? 'since period start' : 'vs previous period'}
                    available={
                      metric === 'mrr_cents'
                        ? data.snapshot_comparison_available
                        : data.revenue_comparison_available
                    }
                    value={
                      metric === 'mrr_cents'
                        ? growth(data.current.mrr_cents, data.previous.mrr_cents)
                        : data.revenue_growth_percent
                    }
                  />
                </div>
                {data.trend.length ? (
                  <TrendChart data={data.trend} metric={metric} />
                ) : (
                  <Empty title="No revenue yet" />
                )}
                <div className="chart-footnote">
                  <span className="legend-dot" />
                  {metric === 'mrr_cents'
                    ? 'MRR is a snapshot of active recurring charges, not collected payments.'
                    : 'Collected revenue includes paid transactions only. Refunds are shown separately in the ledger.'}
                </div>
              </section>
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Subscriptions by plan</h2>
                    <p>A balanced view of your customer base.</p>
                  </div>
                  <CreditCard size={18} className="muted" />
                </div>
                {data.current.active_subscriptions ? (
                  <PlanChart
                    plans={data.plans.filter((p) => p.subscriptions > 0)}
                    total={data.current.active_subscriptions}
                  />
                ) : (
                  <Empty
                    title="No active subscriptions"
                    description="Assign a subscription to start tracking recurring revenue."
                  />
                )}
              </section>
            </div>
            <div className="insight-strip">
              <div className="insight-icon">
                <TrendingUp size={21} />
              </div>
              <div>
                <strong>{money(data.paid_cents)} in collected payments</strong>
                <p>
                  {data.new_customers} new customers joined during this period.{' '}
                  {!data.revenue_comparison_available
                    ? 'Insufficient history for a full prior-period comparison.'
                    : data.revenue_growth_percent === null
                      ? 'No previous revenue baseline is available.'
                      : `Collected revenue ${data.revenue_growth_percent >= 0 ? 'increased' : 'decreased'} ${Math.abs(data.revenue_growth_percent).toFixed(1)}% compared with the previous period.`}
                </p>
              </div>
              <Button variant="ghost" asChild>
                <Link to={analytics ? '/transactions' : '/analytics'}>
                  {analytics ? 'View ledger' : 'Explore analytics'}
                  <ArrowRight size={16} />
                </Link>
              </Button>
            </div>
            {analytics ? (
              <AnalyticsPanels data={data} />
            ) : (
              <OverviewPanels data={data} timezone={timezone} />
            )}
          </>
        )
      )}
    </>
  );
}
