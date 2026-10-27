import type {
  Analytics,
  Customer,
  CustomerDetail,
  Me,
  Plan,
  SubscriptionDetail,
  Transaction,
  TransactionPage,
} from '@/types';
export const ids = {
  customer: '10000000-0000-4000-8000-000000000001',
  plan: '20000000-0000-4000-8000-000000000001',
  subscription: '30000000-0000-4000-8000-000000000001',
  transaction: '40000000-0000-4000-8000-000000000001',
};
export const me: Me = {
  id: '50000000-0000-4000-8000-000000000001',
  name: 'Alex Morgan',
  email: 'alex@example.com',
  role: 'admin',
  csrf_token: 'test-csrf',
  session_expires_at: '2026-10-27T20:00:00',
  read_only_demo: false,
  organization: {
    id: '60000000-0000-4000-8000-000000000001',
    name: 'Northstar Studio',
    currency: 'EUR',
    timezone: 'Europe/Lisbon',
  },
};
export const customer: Customer = {
  id: ids.customer,
  organization_id: me.organization.id,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  company: 'Prism Labs',
  status: 'active',
  created_at: '2026-01-01T12:00:00',
  updated_at: '2026-01-01T12:00:00',
};
export const plan: Plan = {
  id: ids.plan,
  name: 'Growth',
  price_cents: 7900,
  interval: 'monthly',
  currency: 'EUR',
};
export const activity = {
  id: '70000000-0000-4000-8000-000000000001',
  action: 'subscription.created',
  timestamp: '2026-01-01T12:00:00',
  details: {},
};
export const subscription: SubscriptionDetail = {
  id: ids.subscription,
  customer_id: ids.customer,
  customer_name: customer.name,
  plan_id: ids.plan,
  plan_name: plan.name,
  price_cents: 7900,
  interval: 'monthly',
  status: 'active',
  started_at: '2026-01-01T12:00:00',
  activated_at: '2026-01-01T12:00:00',
  ends_at: null,
  cancelled_at: null,
  activity: [activity],
};
export const transaction: Transaction = {
  id: ids.transaction,
  customer_id: ids.customer,
  customer_name: customer.name,
  subscription_id: ids.subscription,
  amount_cents: 7900,
  currency: 'EUR',
  status: 'paid',
  timestamp: '2026-10-27T10:00:00',
  external_reference: 'SIM-TEST',
};
export const ledger: TransactionPage = {
  items: [transaction],
  total: 41,
  page: 1,
  page_size: 20,
  summary: { paid_cents: 7900, pending_cents: 0, failed_cents: 0, refunded_cents: 0, count: 41 },
};
export const detail: CustomerDetail = {
  ...customer,
  subscriptions: [subscription],
  transactions: [transaction],
  activity: [activity],
};
export const analytics: Analytics = {
  history_start: '2024-01-01T00:00:00Z',
  snapshot_comparison_available: true,
  revenue_comparison_available: true,
  start_date: '2026-10-01',
  end_date: '2026-10-27',
  timezone: 'Europe/Lisbon',
  snapshot_at: '2026-10-27T12:00:00Z',
  current: {
    mrr_cents: 7900,
    arr_cents: 94800,
    active_subscriptions: 2,
    paying_customers: 1,
    arpu_cents: 7900,
  },
  previous: {
    mrr_cents: 2900,
    arr_cents: 34800,
    active_subscriptions: 1,
    paying_customers: 1,
    arpu_cents: 2900,
  },
  churn_percent: 0,
  paid_cents: 7900,
  previous_paid_cents: 2900,
  revenue_growth_percent: 172.41,
  new_customers: 1,
  trend: [
    {
      date: '2026-10-01',
      mrr_cents: 7900,
      paid_cents: 7900,
      customers: 1,
      new_subscriptions: 2,
      cancelled_subscriptions: 0,
    },
  ],
  plans: [
    { plan_id: ids.plan, name: 'Growth', subscriptions: 2, mrr_cents: 7900, paid_cents: 7900 },
  ],
};
