import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendPoint } from '@/types';
import { money, number } from '@/lib/utils';
export function TrendChart({
  data,
  metric = 'mrr_cents',
}: {
  data: TrendPoint[];
  metric?: 'mrr_cents' | 'paid_cents' | 'customers';
}) {
  const financial = metric !== 'customers';
  const label =
    metric === 'mrr_cents' ? 'MRR' : metric === 'paid_cents' ? 'Collected revenue' : 'Customers';
  return (
    <>
      <div
        className="chart-container"
        role="img"
        aria-label={`${label} trend across ${data.length} reporting intervals. A data table follows.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={'gradient-' + metric} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b72ed" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#3b72ed" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
            <XAxis
              dataKey="date"
              tickFormatter={(value) =>
                new Date(String(value) + 'T12:00:00Z').toLocaleDateString('en-GB', {
                  month: 'short',
                  day: data.length > 31 ? undefined : 'numeric',
                })
              }
              axisLine={false}
              tickLine={false}
              minTickGap={36}
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
              dy={9}
            />
            <YAxis
              width={58}
              tickFormatter={(value) =>
                financial
                  ? `€${Number(value) >= 100000 ? (Number(value) / 100000).toFixed(0) + 'k' : Number(value) / 100}`
                  : number(Number(value))
              }
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                fontSize: 12,
                color: 'var(--text)',
              }}
              formatter={(value) => [
                financial ? money(Number(value)) : number(Number(value)),
                label,
              ]}
              labelFormatter={(value) => String(value)}
            />
            <Area
              name={label}
              type="monotone"
              dataKey={metric}
              stroke="#3b72ed"
              strokeWidth={2.5}
              fill={`url(#gradient-${metric})`}
              activeDot={{ r: 5, strokeWidth: 3, stroke: 'var(--surface)' }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-data">
        <summary>View chart data</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>{label}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.date}>
                  <td>{p.date}</td>
                  <td>{financial ? money(p[metric]) : number(p[metric])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
export function LifecycleChart({ data }: { data: TrendPoint[] }) {
  return (
    <div
      className="chart-container"
      role="img"
      aria-label="New and cancelled subscriptions by reporting interval"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis
            dataKey="date"
            tickFormatter={(v) =>
              new Date(String(v)).toLocaleDateString('en-GB', { month: 'short' })
            }
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            minTickGap={35}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            width={32}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
            }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="new_subscriptions" name="New" fill="#3b72ed" radius={[3, 3, 0, 0]} />
          <Bar
            dataKey="cancelled_subscriptions"
            name="Cancelled"
            fill="#a7badb"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
