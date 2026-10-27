import { useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, ChartNoAxesCombined, Check, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Field, FormError, Loading } from '@/components/ui/shared';
import type { WorkspaceSelection } from '@/types';
export const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password').max(128),
});
export default function Login() {
  useEffect(() => {
    document.title = 'Sign in · MetricsFlow';
  }, []);
  const session = useSession();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [workspaces, setWorkspaces] = useState<WorkspaceSelection['workspaces']>([]);
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof api.login>[0]) => api.login(data),
    onSuccess: (me) => {
      if ('requires_workspace' in me) {
        setWorkspaces(me.workspaces);
        return;
      }
      form.reset();
      client.clear();
      client.setQueryData(['me'], me);
      navigate('/', { replace: true });
    },
  });
  if (session.isPending) return <Loading />;
  if (session.data) return <Navigate to="/" replace />;
  return (
    <div className="login-page">
      <section className="login-story">
        <a href="/" className="brand">
          <span className="brand-mark">
            <ChartNoAxesCombined size={23} />
          </span>
          MetricsFlow
        </a>
        <div className="login-story-content">
          <span className="story-tag">CLARITY, AT EVERY STAGE</span>
          <h1>
            Your business.
            <br />
            In perspective.
          </h1>
          <p>
            From the first subscriber to your next milestone. See the numbers that move your
            business forward.
          </p>
          <div className="story-features">
            {['One source of truth', 'Every customer, connected', 'Decisions backed by data'].map(
              (label) => (
                <span key={label}>
                  <Check size={16} />
                  {label}
                </span>
              ),
            )}
          </div>
          <div className="story-visual">
            <div className="story-visual-top">
              <span>SUBSCRIPTION INTELLIGENCE</span>
              <span className="live-dot">Illustrative preview</span>
            </div>
            <div className="decorative-bars" aria-hidden="true">
              {[23, 35, 30, 46, 41, 56, 48, 62, 71, 66, 82, 94].map((h, i) => (
                <i key={i} style={{ height: h + '%' }} />
              ))}
            </div>
            <span className="story-caption">A clearer view of what comes next.</span>
          </div>
        </div>
        <small>Built for thoughtful, growing businesses.</small>
      </section>
      <main className="login-main">
        <div className="login-form">
          <span className="eyebrow">YOUR WORKSPACE AWAITS</span>
          <h2>Welcome back</h2>
          <p>Sign in to your MetricsFlow workspace.</p>
          {import.meta.env.VITE_DEMO_EMAIL && import.meta.env.VITE_DEMO_PASSWORD && (
            <div className="info-box">
              <strong>Explore the read-only demo</strong>
              <p>All records are fictional. Admin workflows are available when running locally.</p>
              <Button
                variant="outline"
                type="button"
                disabled={mutation.isPending}
                onClick={() => {
                  form.setValue('email', import.meta.env.VITE_DEMO_EMAIL);
                  form.setValue('password', import.meta.env.VITE_DEMO_PASSWORD);
                  mutation.mutate(form.getValues());
                }}
              >
                Enter demo workspace
              </Button>
            </div>
          )}
          {workspaces.length ? (
            <section aria-label="Choose workspace">
              <h3>Choose your workspace</h3>
              <p>Your password was verified. Select where to continue.</p>
              {workspaces.map((workspace) => (
                <Button
                  key={workspace.id}
                  variant="outline"
                  className="login-submit"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({ ...form.getValues(), organization_id: workspace.id })
                  }
                >
                  {workspace.name} · {workspace.role}
                </Button>
              ))}
              <FormError error={mutation.error} />
              <Button
                variant="ghost"
                onClick={() => {
                  setWorkspaces([]);
                  form.reset();
                  mutation.reset();
                }}
              >
                Use another account
              </Button>
            </section>
          ) : (
            <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} noValidate>
              <Field id="email" label="Work email" error={form.formState.errors.email?.message}>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@company.com"
                  aria-invalid={!!form.formState.errors.email}
                  {...form.register('email')}
                />
              </Field>
              <Field id="password" label="Password" error={form.formState.errors.password?.message}>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  aria-invalid={!!form.formState.errors.password}
                  {...form.register('password')}
                />
              </Field>
              <FormError error={mutation.error} />
              <Button className="login-submit" disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <Loader2 size={17} className="spin" />
                ) : (
                  <ArrowRight size={17} />
                )}
                Sign in to workspace
              </Button>
            </form>
          )}
          <div className="login-note">
            <span className="live-dot">Secure workspace</span>
            <p>
              Your session is protected with an encrypted connection in production and an HTTP-only
              cookie.
            </p>
          </div>
        </div>
        <footer>
          MetricsFlow <span>Subscription intelligence, made clear.</span>
        </footer>
      </main>
    </div>
  );
}
