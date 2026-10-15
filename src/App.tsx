/**
 * Route table and the authenticated shell.
 *
 * Screens live under /p/:projectId because every one of them is scoped to a
 * single project; putting the id in the path rather than in context means a
 * bookmark or a refresh lands on the same screen instead of resetting to a
 * default.
 *
 * Layout: fixed white w-60 (240px) left sidebar + content-only topbar with
 * breadcrumbs. Fixed on desktop, hamburger drawer on mobile. Shared by both
 * /projects (OrgShell) and /p/:projectId/* (ProjectShell).
 */

import {useEffect, useState, type ReactNode} from 'react';
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Code2,
  Inbox,
  LayoutGrid,
  LogOut,
  Menu,
  MessagesSquare,
  Settings as SettingsIcon,
  Sliders,
  X,
} from 'lucide-react';

import {useActiveProjectId, useAuth} from './lib/auth';
import {useProjects} from './lib/queries';
import {Button, Spinner} from './components/ui';

import {LoginScreen, SignupScreen} from './pages/auth';
import {ProjectsScreen} from './pages/Projects';
import {InstallScreen} from './pages/Install';
import {CustomizeScreen} from './pages/Customize';
import {KnowledgeScreen} from './pages/Knowledge';
import {PromptsScreen} from './pages/Prompts';
import {InboxScreen} from './pages/Inbox';
import {AnalyticsScreen} from './pages/Analytics';
import {SettingsScreen} from './pages/Settings';
import {LandingScreen} from './pages/Landing';
import {BillingReturnScreen} from './pages/BillingReturn';

const NAV = [
  {to: 'install', label: 'Install', icon: Code2},
  {to: 'knowledge', label: 'Knowledge', icon: BookOpen},
  {to: 'customize', label: 'Customize', icon: Sliders},
  {to: 'prompts', label: 'Prompts', icon: MessagesSquare},
  {to: 'inbox', label: 'Inbox', icon: Inbox},
  {to: 'analytics', label: 'Analytics', icon: BarChart3},
  {to: 'settings', label: 'Settings', icon: SettingsIcon},
] as const;

type Crumb = {label: string; to?: string};

function RequireAuth({children}: {children: ReactNode}) {
  const {loggedIn, booting} = useAuth();
  if (booting) return <Spinner label="Restoring session" />;
  if (!loggedIn) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function navClass({isActive}: {isActive: boolean}): string {
  return [
    'flex min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
    isActive
      ? 'bg-blue-50 font-medium text-blue-700'
      : 'text-slate-600 hover:bg-slate-100',
  ].join(' ');
}

const selectClass =
  'w-full min-w-0 truncate rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700';

/** Breadcrumb trail with ChevronRight separators. Current page is plain text. */
function Breadcrumbs({items}: {items: Crumb[]}) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && (
                <ChevronRight size={14} className="shrink-0 text-slate-400" aria-hidden />
              )}
              {item.to && !last ? (
                <Link
                  to={item.to}
                  className="shrink-0 text-slate-500 transition hover:text-slate-800"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={`truncate ${last ? 'font-medium text-slate-900' : 'text-slate-500'}`}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Shared admin frame: fixed white w-60 sidebar + content column with a slim
 * sticky topbar. On mobile the sidebar is a hamburger-triggered drawer.
 */
function ShellFrame({
  breadcrumbs,
  sidebar,
  children,
}: {
  breadcrumbs: Crumb[];
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Close the mobile drawer on Escape. Desktop is unaffected (sidebar always
  // visible there).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 bg-slate-900/40 md:hidden"
        />
      )}

      <aside
        aria-label="Primary navigation"
        className={`fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
          <NavLink
            to="/projects"
            onClick={() => setOpen(false)}
            className="flex min-w-0 items-center gap-2 font-semibold text-slate-900"
          >
            <LayoutGrid size={18} className="shrink-0 text-blue-600" aria-hidden />
            <span className="truncate">OmniSupport</span>
          </NavLink>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4" onClick={() => setOpen(false)}>
          {sidebar}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            aria-expanded={open}
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 md:hidden"
          >
            <Menu size={18} aria-hidden />
          </button>
          <Breadcrumbs items={breadcrumbs} />
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
          <div className="mx-auto min-w-0 max-w-7xl space-y-5">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** Sidebar footer shared by both shells: user email + sign out. */
function SidebarFooter() {
  const {me, signOut} = useAuth();
  return (
    <div className="mt-auto border-t border-slate-200 pt-3">
      {me && <p className="truncate px-1 text-xs text-slate-500">{me.user.email}</p>}
      <Button
        variant="ghost"
        onClick={() => void signOut()}
        className="mt-1 w-full justify-start"
      >
        <LogOut size={15} aria-hidden />
        Sign out
      </Button>
    </div>
  );
}

/** Chrome shared by every project-scoped screen. */
function ProjectShell() {
  const {projectId} = useParams();
  const location = useLocation();
  const {me, activeOrg, selectOrg} = useAuth();
  const [, setActiveId] = useActiveProjectId(activeOrg?.id ?? null);
  const projects = useProjects();

  // Keep the persisted selection in step with the URL. In an effect, not during
  // render: a setState during render re-triggers render.
  useEffect(() => {
    if (projectId) setActiveId(projectId);
  }, [projectId, setActiveId]);

  const project = projects.data?.find((p) => p.id === projectId) ?? null;

  // A project id in the URL that this org does not own is a dead end rather
  // than a 403 worth showing. The backend already returned 404 for another
  // tenant's id, so reaching here means the id is simply gone.
  if (projectId && projects.data && !project) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Project not found</h1>
        <p className="mt-1 text-sm text-slate-500">
          It may belong to another organization, or have been deleted.
        </p>
        <NavLink to="/projects" className="mt-5 inline-block">
          <Button>Back to projects</Button>
        </NavLink>
      </div>
    );
  }

  const pageLabel =
    NAV.find(({to}) => location.pathname.endsWith(`/${to}`))?.label ?? 'Overview';
  const breadcrumbs: Crumb[] = [
    {label: 'Projects', to: '/projects'},
    {label: project?.name ?? projectId ?? 'Project', to: `/p/${projectId}/install`},
    {label: pageLabel},
  ];

  return (
    <ShellFrame
      breadcrumbs={breadcrumbs}
      sidebar={
        <>
          {me && me.organizations.length > 0 && (
            <label className="block text-xs font-medium text-slate-500">
              Organization
              <select
                aria-label="Active organization"
                value={activeOrg?.id ?? ''}
                onChange={(e) => selectOrg(e.target.value)}
                className={`${selectClass} mt-1`}
              >
                {me.organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {projects.data && projects.data.length > 0 && (
            <label className="block text-xs font-medium text-slate-500">
              Project
              <select
                aria-label="Active project"
                value={projectId ?? ''}
                onChange={(e) => {
                  window.location.assign(`/p/${e.target.value}/install`);
                }}
                className={`${selectClass} mt-1`}
              >
                {projects.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <nav aria-label="Project navigation" className="min-w-0">
            <ul className="space-y-1">
              {NAV.map(({to, label, icon: Icon}) => (
                <li key={to}>
                  <NavLink to={`/p/${projectId}/${to}`} className={navClass}>
                    <Icon size={16} className="shrink-0" aria-hidden />
                    <span className="truncate">{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <SidebarFooter />
        </>
      }
    >
      <Outlet />
    </ShellFrame>
  );
}

/** Shell for signed-in users with no project selected yet. */
function OrgShell({children}: {children: ReactNode}) {
  const {me, activeOrg, selectOrg} = useAuth();
  const breadcrumbs: Crumb[] = [
    {label: activeOrg?.name ?? 'Organization'},
    {label: 'Projects'},
  ];

  return (
    <ShellFrame
      breadcrumbs={breadcrumbs}
      sidebar={
        <>
          {me && me.organizations.length > 0 && (
            <label className="block text-xs font-medium text-slate-500">
              Organization
              <select
                aria-label="Active organization"
                value={activeOrg?.id ?? ''}
                onChange={(e) => selectOrg(e.target.value)}
                className={`${selectClass} mt-1`}
              >
                {me.organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <nav aria-label="Workspace navigation" className="min-w-0">
            <ul className="space-y-1">
              <li>
                <NavLink to="/projects" end className={navClass}>
                  <LayoutGrid size={16} className="shrink-0" aria-hidden />
                  <span className="truncate">Projects</span>
                </NavLink>
              </li>
            </ul>
          </nav>

          <SidebarFooter />
        </>
      }
    >
      {children}
    </ShellFrame>
  );
}

export default function App() {
  const {loggedIn, booting} = useAuth();
  if (booting) return <Spinner label="Starting" />;

  return (
    <Routes>
      <Route path="/login" element={loggedIn ? <Navigate to="/projects" replace /> : <LoginScreen />} />
      <Route path="/signup" element={loggedIn ? <Navigate to="/projects" replace /> : <SignupScreen />} />
      <Route
        path="/billing/success"
        element={
          <RequireAuth>
            <BillingReturnScreen />
          </RequireAuth>
        }
      />

      <Route
        path="/projects"
        element={
          <RequireAuth>
            <OrgShell>
              <ProjectsScreen />
            </OrgShell>
          </RequireAuth>
        }
      />

      <Route path="/" element={loggedIn ? <Navigate to="/projects" replace /> : <LandingScreen />} />
      <Route
        path="/p/:projectId"
        element={
          <RequireAuth>
            <ProjectShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="install" replace />} />
        <Route path="install" element={<InstallScreen />} />
        <Route path="knowledge" element={<KnowledgeScreen />} />
        <Route path="customize" element={<CustomizeScreen />} />
        <Route path="prompts" element={<PromptsScreen />} />
        <Route path="inbox" element={<InboxScreen />} />
        <Route path="analytics" element={<AnalyticsScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
