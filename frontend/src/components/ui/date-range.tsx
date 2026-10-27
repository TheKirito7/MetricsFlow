import { CalendarDays } from 'lucide-react';
import { useId, useState } from 'react';
import { daysBefore, localToday } from '@/lib/utils';
import { Button } from './button';
export type DateRange = { start_date: string; end_date: string };
export function initialRange(timezone: string, days = 365): DateRange {
  const today = localToday(timezone);
  return { start_date: daysBefore(today, days - 1), end_date: today };
}
function CustomRange({
  value,
  onChange,
  today,
}: {
  value: DateRange;
  onChange: (value: DateRange) => void;
  today: string;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <form
      className="custom-dates"
      onSubmit={(event) => {
        event.preventDefault();
        onChange(draft);
      }}
    >
      <label>
        <span className="sr-only">Start date</span>
        <input
          type="date"
          value={draft.start_date}
          max={draft.end_date}
          required
          onChange={(event) => setDraft({ ...draft, start_date: event.target.value })}
        />
      </label>
      <span>–</span>
      <label>
        <span className="sr-only">End date</span>
        <input
          type="date"
          value={draft.end_date}
          min={draft.start_date}
          max={today}
          required
          onChange={(event) => setDraft({ ...draft, end_date: event.target.value })}
        />
      </label>
      <Button size="sm" variant="outline">
        Apply
      </Button>
    </form>
  );
}
export function DateRangeControl({
  value,
  onChange,
  timezone,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  timezone: string;
}) {
  const id = useId();
  const [customOpen, setCustomOpen] = useState(false);
  const matched = [7, 30, 90, 365].find((days) => {
    const range = initialRange(timezone, days);
    return range.start_date === value.start_date && range.end_date === value.end_date;
  });
  const preset = customOpen ? 'custom' : matched ? String(matched) : 'custom';
  return (
    <div className="date-range">
      <CalendarDays size={16} />
      <label className="sr-only" htmlFor={id}>
        Reporting period
      </label>
      <select
        id={id}
        value={preset}
        onChange={(event) => {
          const custom = event.target.value === 'custom';
          setCustomOpen(custom);
          if (!custom) onChange(initialRange(timezone, Number(event.target.value)));
        }}
      >
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
        <option value="365">Last 12 months</option>
        <option value="custom">Custom range</option>
      </select>
      {preset === 'custom' && !customOpen && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setCustomOpen(true)}
          aria-label="Edit custom dates"
        >
          Edit
        </Button>
      )}
      {customOpen && (
        <CustomRange
          key={value.start_date + value.end_date}
          value={value}
          today={localToday(timezone)}
          onChange={(range) => {
            setCustomOpen(false);
            onChange(range);
          }}
        />
      )}
    </div>
  );
}
