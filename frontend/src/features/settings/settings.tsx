import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Globe2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { utcDate } from '@/lib/utils';
import { api } from '@/lib/api';
import { useSession } from '@/hooks/use-session';
import type { Organization } from '@/types';
import { Button } from '@/components/ui/button';
import { Field, FormError, PageHeading } from '@/components/ui/shared';
const schema = z.object({
  name: z.string().trim().min(1, 'Enter an organization name').max(120),
  timezone: z.string().min(1, 'Choose a reporting timezone'),
});
export default function Settings() {
  const { data: me } = useSession();
  const client = useQueryClient();
  const isAdmin = me?.role === 'admin' && !me.read_only_demo;
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    values: {
      name: me?.organization.name ?? '',
      timezone: me?.organization.timezone ?? 'Europe/Lisbon',
    },
  });
  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      api.patch<Organization>('/organization', values),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['me'] }),
        client.invalidateQueries({ queryKey: ['analytics'] }),
        client.invalidateQueries({ queryKey: ['transactions'] }),
      ]);
    },
  });
  return (
    <>
      <PageHeading
        eyebrow="MAKE YOURSELF AT HOME"
        title="Settings"
        description="The details that make this workspace yours."
      />
      <div className="settings-grid">
        <div>
          <h2>Organization preferences</h2>
          <p className="muted">Manage your workspace identity and reporting boundaries.</p>
          {!isAdmin && (
            <div className="info-box">
              You have viewer access. An administrator can update these settings.
            </div>
          )}
        </div>
        <section className="panel settings-panel">
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} noValidate>
            <Field
              label="Organization name"
              id="org-name"
              error={form.formState.errors.name?.message}
            >
              <input id="org-name" disabled={!isAdmin} {...form.register('name')} />
            </Field>
            <Field
              label="Reporting timezone"
              id="org-timezone"
              error={form.formState.errors.timezone?.message}
              hint="Date filters use local midnight in this timezone. Stored timestamps remain UTC."
            >
              <select id="org-timezone" disabled={!isAdmin} {...form.register('timezone')}>
                {Array.from(
                  new Set([
                    me?.organization.timezone ?? 'Europe/Lisbon',
                    'UTC',
                    'Europe/Lisbon',
                    'Europe/London',
                    'Europe/Berlin',
                    'Europe/Paris',
                    'Europe/Amsterdam',
                    'America/New_York',
                    'Asia/Tokyo',
                  ]),
                ).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Currency"
              id="org-currency"
              hint="EUR is the supported currency for this release."
            >
              <input id="org-currency" value="EUR — Euro" disabled readOnly />
            </Field>
            <FormError error={mutation.error} />
            {mutation.isSuccess && (
              <div className="save-success" role="status">
                <Check size={16} />
                Workspace preferences saved.
              </div>
            )}
            {isAdmin && (
              <div className="settings-actions">
                <Button disabled={mutation.isPending}>
                  {mutation.isPending ? 'Saving…' : 'Save preferences'}
                </Button>
              </div>
            )}
          </form>
        </section>
      </div>
      <div className="settings-grid">
        <div>
          <h2>Account & security</h2>
          <p className="muted">Your access to this organization.</p>
        </div>
        <section className="panel settings-panel">
          <div className="security-row">
            <span className="activity-icon">
              <ShieldCheck size={18} />
            </span>
            <div>
              <strong>{me?.name}</strong>
              <p>{me?.email}</p>
            </div>
            <span className="role-label">{me?.role}</span>
          </div>
          <div className="security-row">
            <span className="activity-icon">
              <LockKeyhole size={18} />
            </span>
            <div>
              <strong>Protected session</strong>
              <p>
                HTTP-only session · CSRF protection
                {me && (
                  <>
                    {' '}
                    · Expires{' '}
                    {new Intl.DateTimeFormat('en-GB', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: me.organization.timezone,
                    }).format(utcDate(me.session_expires_at))}
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="security-row">
            <span className="activity-icon">
              <Globe2 size={18} />
            </span>
            <div>
              <strong>Organization-isolated data</strong>
              <p>Every request is scoped to your verified membership.</p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
