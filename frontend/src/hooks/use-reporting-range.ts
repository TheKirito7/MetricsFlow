import { initialRange, type DateRange } from '@/components/ui/date-range';
import { useUrlFilters } from './use-url-filters';

export function useReportingRange(timezone: string | undefined, days = 365) {
  // Derive after session resolution rather than capturing a fallback timezone in state.
  const defaults = initialRange(timezone ?? 'UTC', days);
  const { values, update } = useUrlFilters(defaults);
  const range: DateRange = { start_date: values.start_date, end_date: values.end_date };
  return { range, setRange: (value: DateRange) => update({ ...value, page: 1 }) };
}
