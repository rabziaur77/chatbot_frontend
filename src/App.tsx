/**
 * Route table and the authenticated shell.
 *
 * Screens live under /p/:projectId because every one of them is scoped to a
 * single project; putting the id in the path rather than in context means a
 * bookmark or a refresh lands on the same screen instead of resetting to a
 * default.
 */

import {useEffect, type ReactNode} from 'react';
import {NavLink, Navigate, Outlet, Route, Routes, useParams} from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Code2,
  Inbox,
  LayoutGrid,
  LogOut,
  MessagesSquare,
  Settings as SettingsIcon,
  Sliders,
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

const NAV = [
  {to: 'install', label: 'Install', icon: Code2},
  {to: 'knowledge', label: 'Knowledge', icon: BookOpen},
  {to: 'customize', label: 'Customize', icon: Sliders},
  {to: 'prompts', label: 'Prompts', icon: MessagesSquare},
  {to: 'inbox', label: 'Inbox', icon: Inbox},
  {to: 'analytics', label: 'Analytics', icon: BarChart3},
  {to: 'settings', label: 'Settings', icon: SettingsIcon},
] as const;

function RequireAuth({children}: {children: ReactNode}) {
  const {loggedIn, booting} = useAuth();
  if (booting) return <Spinner label="Restoring session" />;
  if (!loggedIn) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function navClass({isActive}: {isActive: boolean}): string {
  return [
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
    isActive
      ? 'bg-blue-50 font-medium text-blue-700'
      : 'text-slate-600 hover:bg-slate-100',
  ].join(' ');
}

/** Chrome shared by every project-scoped screen. */
function ProjectShell() {
  const {projectId} = useParams();
  const {me, activeOrg, selectOrg, signOut} = useAuth();
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <NavLink
            to="/projects"
            className="flex items-center gap-2 font-semibold text-slate-900"
          >
            <LayoutGrid size={18} className="text-blue-600" aria-hidden />
            OmniSupport
          </NavLink>

          {me && me.organizations.length > 0 && (
            <select
              aria-label="Active organization"
              value={activeOrg?.id ?? ''}
              onChange={(e) => selectOrg(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
            >
              {me.organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          )}

          {projects.data && projects.data.length > 0 && (
            <select
              aria-label="Active project"
              value={projectId ?? ''}
              onChange={(e) => {
                window.location.assign(`/p/${e.target.value}/install`);
              }}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
            >
              {projects.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <div className="ml-auto flex items-center gap-2">
            {me && (
              <span className="hidden text-xs text-slate-500 sm:inline">{me.user.email}</span>
            )}
            <Button variant="ghost" onClick={() => void signOut()}>
              <LogOut size={15} aria-hidden />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <nav className="hidden w-48 shrink-0 md:block">
          <ul className="sticky top-6 space-y-1">
            {NAV.map(({to, label, icon: Icon}) => (
              <li key={to}>
                <NavLink to={`/p/${projectId}/${to}`} className={navClass}>
                  <Icon size={16} aria-hidden />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 space-y-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Shell for signed-in users with no project selected yet. */
function OrgShell({children}: {children: ReactNode}) {
  const {me, activeOrg, selectOrg, signOut} = useAuth();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <span className="flex items-center gap-2 font-semibold text-slate-900">
            <LayoutGrid size={18} className="text-blue-600" aria-hidden />
            OmniSupport
          </span>
          {me && me.organizations.length > 1 && (
            <select
              aria-label="Active organization"
              value={activeOrg?.id ?? ''}
              onChange={(e) => selectOrg(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              {me.organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          )}
          <div className="ml-auto">
            <Button variant="ghost" onClick={() => void signOut()}>
              <LogOut size={15} aria-hidden />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
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
        path="/projects"
        element={
          <RequireAuth>
            <OrgShell>
              <ProjectsScreen />
            </OrgShell>
          </RequireAuth>
        }
      />

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

      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}