import type { Analytics } from '@/types';

export function planLabel(plan: Analytics['plans'][number], plans: Analytics['plans']) {
  return plans.filter((candidate) => candidate.name === plan.name).length > 1
    ? `${plan.name} · ${plan.plan_id?.slice(0, 8) ?? 'unassigned'}`
    : plan.name;
}
