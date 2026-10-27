import { AlertCircle, ArrowDown, ArrowUp, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { cloneElement, isValidElement, useEffect, type ReactElement, type ReactNode } from 'react';
import { Button } from './button';
import { cn } from '@/lib/utils';
export function Badge({ status }: { status: string }) {
  return (
    <span className={cn('badge', 'badge-' + status)}>
      <span />
      {status}
    </span>
  );
}
export function Loading({ label = 'Loading your data…' }: { label?: string }) {
  return (
    <div
      className="state flex min-h-48 flex-col items-center justify-center gap-3 px-6 py-12 text-center text-muted-foreground"
      role="status"
    >
      <Loader2 className="spin" size={25} />
      <p>{label}</p>
    </div>
  );
}
export function ErrorState({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div
      className="state flex min-h-48 flex-col items-center justify-center gap-3 px-6 py-12 text-center text-muted-foreground"
      role="alert"
    >
      <AlertCircle size={28} />
      <h3 className="text-base font-semibold text-foreground">We couldn’t load this</h3>
      <p>{error.message}</p>
      <Button variant="outline" onClick={retry}>
        <RefreshCw size={15} />
        Try again
      </Button>
    </div>
  );
}
export function Empty({
  title = 'Nothing here yet',
  description = 'Your records will appear here.',
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state flex min-h-48 flex-col items-center justify-center gap-3 px-6 py-12 text-center text-muted-foreground">
      <div className="empty-icon">
        <Inbox size={25} />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · MetricsFlow`;
  }, [title]);
  return (
    <div className="page-heading mb-6 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{actions}</div>
    </div>
  );
}
export function Change({
  value,
  label,
  available = true,
}: {
  value: number | null;
  label: string;
  available?: boolean;
}) {
  return (
    <span className="comparison">
      {!available ? (
        <span className="muted">Insufficient comparison history</span>
      ) : value === null ? (
        <span className="muted">No previous baseline</span>
      ) : (
        <>
          <span className={value >= 0 ? 'positive' : 'negative'}>
            {value >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{' '}
            {Math.abs(value).toFixed(1)}%
          </span>
          <span>{label}</span>
        </>
      )}
    </span>
  );
}
export function Field({
  label,
  id,
  error,
  children,
  hint,
}: {
  label: string;
  id: string;
  error?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="field mb-5 flex min-w-0 flex-col gap-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            'aria-invalid': !!error,
            'aria-describedby':
              [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
                .filter(Boolean)
                .join(' ') || undefined,
          })
        : children}
      {hint && (
        <small className="text-xs leading-relaxed text-muted-foreground" id={`${id}-hint`}>
          {hint}
        </small>
      )}
      {error && (
        <span id={id + '-error'} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
export function FormError({ error }: { error: Error | null }) {
  return error ? (
    <div className="form-error" role="alert">
      <AlertCircle size={16} />
      {error.message}
    </div>
  ) : null;
}
