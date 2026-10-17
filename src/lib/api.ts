/**
 * The HTTP client.
 *
 * Two behaviours here are load-bearing and easy to get wrong:
 *
 * 1. Tokens refresh *proactively* on a timer, never by retrying a 401. The
 *    backend rotates refresh tokens on every use and treats reuse as theft:
 *    a replayed refresh token revokes every session for that user. A
 *    retry-on-401 client that fires two refreshes at once logs the user out.
 *
 * 2. The access token lives in memory only. It is not written to localStorage
 *    because localStorage is readable by any script that gets injected into
 *    the page, and this is a dashboard full of customer content. The refresh
 *    token is an httpOnly cookie the browser manages and we never see.
 *
 * Because the token is in memory, a full page load starts unauthenticated and
 * bootstraps by calling /auth/refresh. That is the normal path, not a failure.
 */

import type {
  AuthResponse,
  MeResponse,
  TokenResponse,
} from './types';

const REFRESH_MARGIN_MS = 60_000;

/**
 * Version prefix for every backend call.
 *
 * One constant rather than a literal per call site, so a future `/api/v2`
 * moves exactly these lines. The backend mounts its aggregate router here and
 * the OpenAPI surface follows it.
 */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
export const API_PREFIX = `${API_BASE_URL}/api/v1`;

export class ApiError extends Error {
  readonly status: number;
  readonly issues: string[];

  constructor(status: number, message: string, issues: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

/**
 * `detail` is a string for application errors and an array of issue objects on
 * a 422. Rendering `[object Object]` in a toast is worse than a generic message,
 * so the array is flattened into readable lines.
 */
function parseErrorBody(status: number, body: unknown): { message: string; issues: string[] } {
  const fallback = `Request failed with status ${status}`;
  if (!body || typeof body !== 'object') return { message: fallback, issues: [] };

  const detail = (body as { detail?: unknown }).detail;

  if (typeof detail === 'string' && detail) {
    return { message: detail, issues: [] };
  }

  if (Array.isArray(detail)) {
    const issues = detail.map((issue) => {
      if (typeof issue === 'string') return issue;
      const item = issue as { loc?: unknown[]; msg?: string };
      const field = Array.isArray(item.loc)
        ? item.loc.filter((p) => p !== 'body').join('.')
        : '';
      const msg = item.msg ?? 'invalid value';
      return field ? `${field}: ${msg}` : msg;
    });
    return { message: issues[0] ?? fallback, issues };
  }

  return { message: fallback, issues: [] };
}

type Listener = () => void;

class TokenStore {
  private token: string | null = null;
  private expiresAt = 0;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  get accessToken(): string | null {
    return this.token;
  }

  get isExpired(): boolean {
    return Date.now() >= this.expiresAt;
  }

  set(token: string, expiresInSeconds: number): void {
    this.token = token;
    // Schedule slightly early so a request never leaves with a token that
    // expires in flight.
    this.expiresAt = Date.now() + expiresInSeconds * 1000;
    this.scheduleRefresh();
    this.emit();
  }

  clear(): void {
    this.token = null;
    this.expiresAt = 0;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private scheduleRefresh(): void {
    if (this.timer) clearTimeout(this.timer);
    const delay = Math.max(this.expiresAt - Date.now() - REFRESH_MARGIN_MS, 5_000);
    this.timer = setTimeout(() => {
      void refreshAccessToken();
    }, delay);
  }
}

export const tokens = new TokenStore();

let onUnauthenticated: (() => void) | null = null;

export function setUnauthenticatedHandler(fn: (() => void) | null): void {
  onUnauthenticated = fn;
}

/**
 * A single in-flight refresh shared by all callers.
 *
 * Without this, three components mounting at once on a cold load would each
 * call /auth/refresh with the same cookie. The backend rotates on first use,
 * so the second and third present an already-rotated token and trip the reuse
 * detector, which revokes every session. Deduplicating is not an optimisation
 * here, it is a correctness requirement.
 */
let refreshInFlight: Promise<boolean> | null = null;

export function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_PREFIX}/auth/refresh`, {
        method: 'POST',
        // The refresh token is an httpOnly cookie; without this it is not sent.
        credentials: 'include',
      });
      if (!res.ok) {
        tokens.clear();
        onUnauthenticated?.();
        return false;
      }
      const data = (await res.json()) as TokenResponse;
      tokens.set(data.access_token, data.expires_in);
      return true;
    } catch {
      tokens.clear();
      onUnauthenticated?.();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

let activeOrgId: string | null = null;

export function setActiveOrgId(id: string | null): void {
  activeOrgId = id;
}

export function getActiveOrgId(): string | null {
  return activeOrgId;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Attach Authorization + X-Org-Id. Default true. */
  authenticated?: boolean;
  query?: Record<string, string | number | undefined>;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, authenticated = true, query } = options;

  // Refresh first if we are holding an expired token, rather than sending a
  // request that is guaranteed to 401.
  if (authenticated && tokens.accessToken && tokens.isExpired) {
    await refreshAccessToken();
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = tokens.accessToken;
  if (authenticated && token) headers['Authorization'] = `Bearer ${token}`;
  if (authenticated && activeOrgId) headers['X-Org-Id'] = activeOrgId;

  let url = path.startsWith(API_PREFIX) ? path : `${API_PREFIX}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && authenticated) {
    // No retry. This is the decision the file header describes and it is not
    // negotiable: the refresh cookie is single-use and rotating. A request that
    // 401s, refreshes, and replays can race the proactive timer, and two
    // concurrent refreshes present the same rotated cookie twice. The backend
    // reads that as token reuse and revokes every session for the user, so a
    // recoverable blip becomes a forced sign-out.
    //
    // The token is refreshed on a schedule ahead of expiry (see
    // scheduleRefresh), so a 401 here means the session really is gone.
    //
    // The session is torn down rather than left in place. Holding a dead token
    // and a stale active org leaves the dashboard rendering the last successful
    // response of every query as if it were live, and every subsequent request
    // fails the same way with no path back: refreshAccessToken() is not called
    // here, so nothing else would ever clear it.
    tokens.clear();
    onUnauthenticated?.();
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }

  if (res.status === 204) return undefined as T;

  let parsed: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    const { message, issues } = parseErrorBody(res.status, parsed);
    throw new ApiError(res.status, message, issues);
  }

  return parsed as T;
}

/** Bootstrap after a page load: exchange the refresh cookie for a token. */
export async function restoreSession(): Promise<MeResponse | null> {
  const ok = await refreshAccessToken();
  if (!ok) return null;
  try {
    return await api<MeResponse>('/auth/me');
  } catch {
    return null;
  }
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const data = await api<AuthResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
    authenticated: false,
  });
  tokens.set(data.access_token, data.expires_in);
  return data;
}

export async function signup(payload: {
  email: string;
  password: string;
  name?: string;
  organization_name: string;
  requested_plan: 'trial' | 'pro' | 'enterprise';
  billing_provider?: 'razorpay' | 'paypal';
}): Promise<AuthResponse> {
  const data = await api<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: payload,
    authenticated: false,
  });
  tokens.set(data.access_token, data.expires_in);
  return data;
}

export async function logout(): Promise<void> {
  try {
    await api<void>('/auth/logout', {method: 'POST'});
  } finally {
    tokens.clear();
    setActiveOrgId(null);
  }
}