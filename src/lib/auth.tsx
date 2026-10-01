/**
 * Session state: who is signed in, which org is active.
 *
 * The access token lives in the api module's memory store and is deliberately
 * not mirrored into React state or localStorage, so nothing here serialises it.
 * `loggedIn` tracks whether a usable token exists, not whether a user object
 * happens to be cached.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {useQueryClient} from '@tanstack/react-query';

import {
  login as apiLogin,
  logout as apiLogout,
  restoreSession,
  setActiveOrgId,
  setUnauthenticatedHandler,
  signup as apiSignup,
  tokens,
} from './api';
import type { AuthResponse, MeResponse, OrgSummary} from './types';

interface AuthValue {
  me: MeResponse | null;
  loggedIn: boolean;
  booting: boolean;
  activeOrg: OrgSummary | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (payload: {
    email: string;
    password: string;
    name?: string;
    organization_name: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  selectOrg: (id: string) => void;
  setMe: (next: MeResponse) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

const ACTIVE_ORG_KEY = 'omni.activeOrgId';

export function AuthProvider({children}: {children: ReactNode}) {
  const [me, setMeState] = useState<MeResponse | null>(null);
  const [booting, setBooting] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_ORG_KEY),
  );
  const queryClient = useQueryClient();
  // selectOrg is a useCallback that must not change identity on every render,
  // but it also needs to know the current org to no-op a redundant click.
  const activeOrgIdRef = useRef(activeOrgId);
  activeOrgIdRef.current = activeOrgId;

  // A cold load is unauthenticated by construction: the token is in memory, so
  // the only way back in is trading the refresh cookie for a new token.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const restored = await restoreSession();
      if (cancelled) return;
      if (restored) {
        setMeState(restored);
        setLoggedIn(true);
        pickOrg(restored, null);
      }
      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any refresh failure clears the session, so mirror the token store rather
  // than polling it.
  useEffect(() => {
    setUnauthenticatedHandler(() => {
      setLoggedIn(false);
      setMeState(null);
      setActiveOrgId(null);
      localStorage.removeItem(ACTIVE_ORG_KEY);
      setActiveOrgIdState(null);
    });
    return tokens.subscribe(() => {
      setLoggedIn(tokens.accessToken !== null);
    });
  }, []);

  const pickOrg = (payload: MeResponse, preferred: string | null) => {
    const orgs = payload.organizations;
    // Keep the current selection when it is still valid, otherwise fall back to
    // the first org. Storing the id is safe: it is not a credential, and the
    // server re-checks membership on every call.
    const stillValid = preferred && orgs.some((o) => o.id === preferred);
    const chosen = stillValid ? preferred : orgs[0]?.id ?? null;
    setActiveOrgIdState(chosen);
    setActiveOrgId(chosen);
    if (chosen) localStorage.setItem(ACTIVE_ORG_KEY, chosen);
    else localStorage.removeItem(ACTIVE_ORG_KEY);
  };

  const selectOrg = useCallback(
    (id: string) => {
      if (id === activeOrgIdRef.current) return;
      setActiveOrgIdState(id);
      setActiveOrgId(id);
      localStorage.setItem(ACTIVE_ORG_KEY, id);
      // Second layer behind the org-scoped query keys: drop everything rather
      // than relying on key hygiene alone. A cache keyed correctly still holds
      // the previous tenant's rows in memory, and anything that reads the cache
      // without a key (an error boundary, a stale closure) could surface them.
      queryClient.clear();
    },
    [queryClient],
  );

  /**
   * Land a freshly authenticated user.
   *
   * The previous user's org is deliberately *not* preferred. The id is validated
   * against the new membership list, so nothing leaks, but the common case is
   * two different people on one shared browser: user B would be dropped into
   * whatever org user A last had selected before falling back to their own
   * first org, which reads as a glitch and can hide a real org behind a switch.
   */
  const applyAuth = useCallback((data: AuthResponse) => {
    const payload: MeResponse = {
      user: data.user,
      organizations: data.organizations,
    };
    setMeState(payload);
    setLoggedIn(true);
    queryClient.clear();
    pickOrg(payload, null);
  }, [queryClient]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      applyAuth(await apiLogin(email, password));
    },
    [applyAuth],
  );

  const signUp = useCallback(
    async (payload: {
      email: string;
      password: string;
      name?: string;
      organization_name: string;
    }) => {
      applyAuth(await apiSignup(payload));
    },
    [applyAuth],
  );

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      // Local state is cleared even if the request fails: the tokens are gone
      // from the store either way, and leaving the cache behind would show the
      // next person on this machine the previous tenant's rows.
      setMeState(null);
      setLoggedIn(false);
      setActiveOrgId(null);
      setActiveOrgIdState(null);
      localStorage.removeItem(ACTIVE_ORG_KEY);
      queryClient.clear();
    }
  }, [queryClient]);

  const activeOrg = useMemo(
    () => me?.organizations.find((o) => o.id === activeOrgId) ?? null,
    [me, activeOrgId],
  );

  const value = useMemo<AuthValue>(
    () => ({
      me,
      loggedIn,
      booting,
      activeOrg,
      signIn,
      signUp,
      signOut,
      selectOrg,
      setMe: setMeState,
    }),
    [me, loggedIn, booting, activeOrg, signIn, signUp, signOut, selectOrg],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/**
 * The active project, persisted per organization.
 *
 * Projects are the unit every screen is scoped to, so the selection is kept
 * alongside the org switcher rather than in each screen's local state.
 */
/**
 * Storage key for the per-organization project selection.
 *
 * Namespaced by org because the docstring promises "per organization" and a
 * single global key cannot keep that promise: switching orgs handed the new
 * tenant the previous one's project id, which 404s on every screen and, until
 * the user reacts, renders the last org's project from cache first.
 */
const ACTIVE_PROJECT_KEY_PREFIX = 'omni.activeProjectId.';

function activeProjectKey(orgId: string | null): string | null {
  return orgId ? `${ACTIVE_PROJECT_KEY_PREFIX}${orgId}` : null;
}

export function useActiveProjectId(orgId: string | null): [string | null, (id: string | null) => void] {
  // Read lazily per org rather than in a single useState initialiser: the org is
  // resolved asynchronously at boot, so an initialiser would capture null.
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    const key = activeProjectKey(orgId);
    setProjectId(key ? localStorage.getItem(key) : null);
  }, [orgId]);

  const select = useCallback(
    (id: string | null) => {
      const key = activeProjectKey(orgId);
      setProjectId(id);
      if (!key) return;
      if (id) localStorage.setItem(key, id);
      else localStorage.removeItem(key);
    },
    [orgId],
  );

  return [projectId, select];
}