import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { Analytics } from '@/types';
import { money, number } from '@/lib/utils';
import { planLabel } from '@/lib/plan-label';
const colors = ['#3971ed', '#739afa', '#abc4fc', '#d6e3ff', '#64748b'];
export function PlanChart({ plans, total }: { plans: Analytics['plans']; total: number }) {
  return (
    <>
      <div
        className="donut-container"
        role="img"
        aria-label={`Distribution of ${total} active subscriptions by plan`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={plans.map((p) => ({ ...p, label: planLabel(p, plans) }))}
              dataKey="subscriptions"
              nameKey="label"
              innerRadius="70%"
              outerRadius="95%"
              paddingAngle={3}
              stroke="none"
              isAnimationActive={false}
            >
              {plans.map((p, i) => (
                <Cell
                  key={`${p.plan_id ?? 'unassigned'}:${p.name}`}
                  fill={colors[i % colors.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-label">
          <strong>{number(total)}</strong>
          <span>subscriptions</span>
        </div>
      </div>
      <div className="plan-legend">
        {plans.map((p, i) => (
          <div key={`${p.plan_id ?? 'unassigned'}:${p.name}`}>
            <span className="legend-dot" style={{ background: colors[i % colors.length] }} />
            <span>{planLabel(p, plans)}</span>
            <strong>{p.subscriptions}</strong>
            <small>{money(p.mrr_cents, true)} MRR</small>
          </div>
        ))}
      </div>
    </>
  );
}
