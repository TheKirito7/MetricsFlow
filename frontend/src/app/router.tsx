import { Component, lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { useSession } from '@/hooks/use-session';
import { ErrorState, Loading, PageHeading } from '@/components/ui/shared';
import { Button } from '@/components/ui/button';
import { Link, useLocation } from 'react-router-dom';
import AppLayout from '@/components/layout/app-layout';
const Login = lazy(() => import('@/features/auth/login'));
const Dashboard = lazy(() => import('@/features/dashboard/dashboard'));
const Customers = lazy(() => import('@/features/customers/customers'));
const CustomerDetail = lazy(() => import('@/features/customers/customer-detail'));
const Subscriptions = lazy(() => import('@/features/subscriptions/subscriptions'));
const Transactions = lazy(() => import('@/features/transactions/transactions'));
const Settings = lazy(() => import('@/features/settings/settings'));
function RoutePage({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary key={pathname}>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </ErrorBoundary>
  );
}
function NotFound() {
  return (
    <>
      <PageHeading
        title="Page not found"
        description="This address does not match a page in your workspace."
      />
      <section className="panel p-8">
        <p className="mb-6 text-muted-foreground">Check the link or return to your overview.</p>
        <Button asChild>
          <Link to="/">Back to overview</Link>
        </Button>
      </section>
    </>
  );
}
function Protected() {
  const session = useSession();
  if (session.isPending) return <Loading />;
  if (session.error)
    return session.error instanceof ApiError && session.error.status === 401 ? (
      <Navigate to="/login" replace />
    ) : (
      <ErrorState error={session.error} retry={() => void session.refetch()} />
    );
  return <Outlet />;
}
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <ErrorState
        error={new Error('Please reload the page to recover.')}
        retry={() => location.reload()}
      />
    ) : (
      this.props.children
    );
  }
}
const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <RoutePage>
        <Login />
      </RoutePage>
    ),
  },
  {
    element: <Protected />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: (
              <RoutePage>
                <Dashboard />
              </RoutePage>
            ),
          },
          {
            path: 'analytics',
            element: (
              <RoutePage>
                <Dashboard analytics />
              </RoutePage>
            ),
          },
          {
            path: 'customers',
            element: (
              <RoutePage>
                <Customers />
              </RoutePage>
            ),
          },
          {
            path: 'customers/:id',
            element: (
              <RoutePage>
                <CustomerDetail />
              </RoutePage>
            ),
          },
          {
            path: 'subscriptions',
            element: (
              <RoutePage>
                <Subscriptions />
              </RoutePage>
            ),
          },
          {
            path: 'transactions',
            element: (
              <RoutePage>
                <Transactions />
              </RoutePage>
            ),
          },
          {
            path: 'settings',
            element: (
              <RoutePage>
                <Settings />
              </RoutePage>
            ),
          },
          {
            path: '*',
            element: (
              <RoutePage>
                <NotFound />
              </RoutePage>
            ),
          },
        ],
      },
    ],
  },
]);
export function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>
        <RouterProvider router={router} />
      </Suspense>
    </ErrorBoundary>
  );
}
