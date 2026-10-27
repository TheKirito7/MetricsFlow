import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronsLeft,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { initials } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { useFocusPanel } from '@/hooks/use-focus-panel';
import { useMediaQuery } from '@/hooks/use-media-query';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/shared';
const links = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/transactions', label: 'Transactions', icon: Activity },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];
export default function AppLayout() {
  const { data: me } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [mobile, setMobile] = useState(false);
  const smallScreen = useMediaQuery('(max-width: 760px)');
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const navigationTrigger = useRef<HTMLButtonElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountTrigger = useRef<HTMLButtonElement>(null);
  useFocusPanel(mobile && smallScreen, setMobile, sidebarRef, navigationTrigger);
  useFocusPanel(menu, setMenu, accountRef, accountTrigger);
  const [dark, setDark] = useState(
    () =>
      localStorage.getItem('metricsflow-theme') === 'dark' ||
      (!localStorage.getItem('metricsflow-theme') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches),
  );
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('metricsflow-theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => {
    const expire = () => {
      client.clear();
      navigate('/login', { replace: true });
    };
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, [client, navigate]);
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      client.clear();
      navigate('/login', { replace: true });
    },
  });
  if (!me) return null;
  const current = links.find((link) =>
    link.to === '/' ? location.pathname === '/' : location.pathname.startsWith(link.to),
  );
  return (
    <div className={'app-shell flex min-h-screen' + (collapsed ? ' sidebar-collapsed' : '')}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {mobile && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        inert={smallScreen && !mobile}
        role={mobile && smallScreen ? 'dialog' : undefined}
        aria-modal={mobile && smallScreen ? true : undefined}
        aria-label={mobile && smallScreen ? 'Workspace navigation' : undefined}
        tabIndex={-1}
        className={'sidebar' + (mobile ? ' mobile-open' : '')}
      >
        {mobile && (
          <Button
            variant="ghost"
            size="icon"
            className="mobile-toggle absolute right-3 top-3"
            aria-label="Close navigation panel"
            onClick={() => setMobile(false)}
          >
            <X size={18} />
          </Button>
        )}
        <NavLink to="/" className="brand" onClick={() => setMobile(false)}>
          <span className="brand-mark">
            <ChartNoAxesCombined size={22} />
          </span>
          <span className="sidebar-label">
            MetricsFlow<span className="brand-period">.</span>
          </span>
        </NavLink>
        <div className="workspace">
          <span className="workspace-logo">{me.organization.name.charAt(0).toUpperCase()}</span>
          <div className="sidebar-label">
            <strong>{me.organization.name}</strong>
            <small>Business workspace</small>
          </div>
        </div>
        <span className="nav-caption sidebar-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={collapsed ? label : undefined}
              onClick={() => setMobile(false)}
            >
              <Icon size={19} />
              <span className="sidebar-label">{label}</span>
              {label === 'Overview' && <span className="nav-dot sidebar-label" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-note sidebar-label">
            <span>
              <ShieldCheck size={17} />
              Subscription workspace
            </span>
            <p>
              Every metric tells a story.
              <br />
              Make yours a good one.
            </p>
            <NavLink to="/analytics" onClick={() => setMobile(false)}>
              Explore analytics
              <ArrowUpRight size={14} />
            </NavLink>
          </div>
          <button
            className="collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronsLeft size={18} />
            <span className="sidebar-label">Collapse sidebar</span>
          </button>
          <div className="sidebar-footer">
            <small className="sidebar-label">Simulated billing data</small>
          </div>
        </div>
      </aside>
      <div className="app-body" inert={smallScreen && mobile}>
        <header className="topbar">
          <div className="breadcrumb">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-toggle"
              ref={navigationTrigger}
              aria-label={mobile ? 'Close navigation' : 'Open navigation'}
              onClick={() => setMobile(!mobile)}
            >
              {mobile ? <X size={20} /> : <Menu size={20} />}
            </Button>
            <span className="breadcrumb-org">Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{current?.label || 'Customer details'}</strong>
          </div>
          <div className="topbar-actions">
            <span className="workspace-secure">
              <ShieldCheck size={14} /> {me.role === 'admin' ? 'Admin workspace' : 'Viewer access'}
            </span>
            <span className="topbar-divider" />
            <Button
              variant="ghost"
              size="icon"
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
            <div className="user-menu">
              <Button
                variant="ghost"
                className="avatar-button"
                ref={accountTrigger}
                aria-label="User menu"
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                <span className="avatar">{initials(me.name)}</span>
                <ChevronDown size={13} />
              </Button>
              {menu && (
                <>
                  <button
                    className="menu-dismiss"
                    aria-label="Close user menu"
                    onClick={() => setMenu(false)}
                  />
                  <div
                    className="user-dropdown"
                    ref={accountRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Account menu"
                    tabIndex={-1}
                  >
                    <strong>{me.name}</strong>
                    <small>{me.email}</small>
                    <span className="role-label">{me.role}</span>
                    <Button
                      variant="ghost"
                      onClick={() => logout.mutate()}
                      disabled={logout.isPending}
                    >
                      <LogOut size={16} />
                      Sign out
                    </Button>
                    <FormError error={logout.error} />
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main id="main" className="main-content" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>
            MetricsFlow <span>·</span> A clearer view of your business.
          </span>
          <span>All amounts in EUR</span>
        </footer>
      </div>
    </div>
  );
}
