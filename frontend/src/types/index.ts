export type Role = 'admin' | 'viewer';
export interface Organization {
  id: string;
  name: string;
  timezone: string;
  currency: string;
}
export interface Me {
  id: string;
  name: string;
  email: string;
  role: Role;
  organization: Organization;
  csrf_token: string;
  session_expires_at: string;
  read_only_demo: boolean;
}
export interface WorkspaceSelection {
  requires_workspace: true;
  workspaces: { id: string; name: string; role: Role }[];
}
export interface Customer {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  company: string | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}
export interface Plan {
  id: string;
  name: string;
  price_cents: number;
  interval: 'monthly' | 'yearly';
  currency: string;
}
export interface Subscription {
  id: string;
  customer_id: string;
  customer_name: string;
  plan_id: string;
  plan_name: string;
  price_cents: number;
  interval: 'monthly' | 'yearly';
  status: 'trial' | 'active' | 'cancelled' | 'expired';
  started_at: string;
  activated_at: string | null;
  ends_at: string | null;
  cancelled_at: string | null;
}
export interface Transaction {
  id: string;
  customer_id: string;
  customer_name: string;
  subscription_id: string | null;
  amount_cents: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  timestamp: string;
  external_reference: string | null;
}
export interface Activity {
  id: string;
  action: string;
  timestamp: string;
  details: Record<string, unknown>;
}
export interface CustomerDetail extends Customer {
  subscriptions: Subscription[];
  transactions: Transaction[];
  activity: Activity[];
}
export interface SubscriptionDetail extends Subscription {
  activity: Activity[];
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
export interface TransactionPage extends Page<Transaction> {
  summary: {
    paid_cents: number;
    pending_cents: number;
    failed_cents: number;
    refunded_cents: number;
    count: number;
  };
}
export interface MetricSnapshot {
  mrr_cents: number;
  arr_cents: number;
  active_subscriptions: number;
  paying_customers: number;
  arpu_cents: number;
}
export interface TrendPoint {
  date: string;
  mrr_cents: number;
  paid_cents: number;
  customers: number;
  new_subscriptions: number;
  cancelled_subscriptions: number;
}
export interface Analytics {
  history_start: string | null;
  snapshot_comparison_available: boolean;
  revenue_comparison_available: boolean;
  start_date: string;
  end_date: string;
  timezone: string;
  snapshot_at: string;
  current: MetricSnapshot;
  previous: MetricSnapshot;
  churn_percent: number;
  paid_cents: number;
  previous_paid_cents: number;
  revenue_growth_percent: number | null;
  new_customers: number;
  trend: TrendPoint[];
  plans: {
    plan_id: string | null;
    name: string;
    subscriptions: number;
    mrr_cents: number;
    paid_cents: number;
  }[];
}
