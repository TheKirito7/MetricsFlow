import { Info } from 'lucide-react';
import { money } from '@/lib/utils';
import { planLabel } from '@/lib/plan-label';
import type { Analytics } from '@/types';
import { TrendChart, LifecycleChart } from '@/components/charts/trend-chart';
export function AnalyticsPanels({ data }: { data: Analytics }) {
  return (
    <>
      <div className="two-column">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Customer growth</h2>
              <p>Total customers acquired, including archived accounts.</p>
            </div>
          </div>
          <TrendChart data={data.trend} metric="customers" />
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Subscription movements</h2>
              <p>New subscriptions and effective cancellations.</p>
            </div>
          </div>
          <LifecycleChart data={data.trend} />
          <details className="chart-data">
            <summary>View chart data</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>New</th>
                    <th>Cancelled</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trend.map((p) => (
                    <tr key={p.date}>
                      <td>{p.date}</td>
                      <td>{p.new_subscriptions}</td>
                      <td>{p.cancelled_subscriptions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Revenue by plan</h2>
            <p>Recurring snapshots and collected period totals, side by side.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Active subscriptions</th>
                <th>Snapshot MRR</th>
                <th>Collected in period</th>
              </tr>
            </thead>
            <tbody>
              {data.plans.map((p) => (
                <tr key={`${p.plan_id ?? 'unassigned'}:${p.name}`}>
                  <td>
                    <strong>{planLabel(p, data.plans)}</strong>
                  </td>
                  <td>{p.subscriptions}</td>
                  <td>{money(p.mrr_cents)}</td>
                  <td>{money(p.paid_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="metric-definitions">
        <Info size={18} />
        <p>
          <strong>Know what you’re measuring.</strong> MRR includes monthly charges plus yearly
          charges ÷ 12 at the snapshot date. ARR is MRR × 12. ARPU divides MRR by unique paying
          customers. Churn measures customers in the starting paying cohort who are no longer paying
          at period end. Growth uses paid transaction totals against an equal-length prior period. A
          missing baseline is shown without a percentage.
        </p>
      </div>
    </>
  );
}
