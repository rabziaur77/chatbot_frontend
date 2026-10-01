/**
 * Query hooks, one per backend route.
 *
 * Keys include the project id so switching projects cannot show the previous
 * project's cached rows while the new ones load.
 *
 * Org-level queries (projects, usage, members, me) are scoped by the X-Org-Id
 * header rather than the URL, so they take the active org id as the first key
 * segment too. Leaving it out was wrong: switching organizations would keep the
 * previous org's rows on screen until the refetch resolved, which puts one
 * tenant's data in front of another. Project-level keys do not need it, because
 * a project id already implies exactly one organization.
 *
 * getActiveOrgId() is read during render, so the key changes in the same render
 * that the org switch is applied.
 */

import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';

import {API_PREFIX, api, getActiveOrgId, tokens} from './api';
import type {
  ConversationDetail,
  ConversationResponse,
  DocumentResponse,
  MeResponse,
  MemberResponse,
  ProjectCreatedResponse,
  ProjectDomainResponse,
  ProjectResponse,
  TicketResponse,
  UsageResponse,
  WidgetConfigResponse,
} from './types';

/** First segment for any query scoped by the active organization. */
function orgKey() {
  return ['org', getActiveOrgId() ?? 'none'] as const;
}

export function useProjects() {
  return useQuery({
    queryKey: [...orgKey(), 'projects'],
    queryFn: () => api<ProjectResponse[]>('/projects'),
  });
}

export function useProject(projectId: string | null) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api<ProjectResponse>(`/projects/${projectId}`),
    enabled: Boolean(projectId),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<ProjectCreatedResponse>('/projects', {method: 'POST', body: {name}}),
    onSuccess: () => {
      void qc.invalidateQueries({queryKey: [...orgKey(), 'projects']});
    },
  });
}

/**
 * Fields a project PATCH may carry.
 *
 * Not `Partial<ProjectResponse>`: that type says `widget_config` is a string,
 * which it is on the way *out* (the column is JSON text) but not on the way in.
 * The backend's `UpdateProjectRequest` takes a dict there, so a `Partial<>` body
 * type let `JSON.stringify(...)` typecheck and every appearance save fail with a
 * 422. Derived from the response on purpose, so a renamed response field stays
 * in sync, with the one input-side difference stated rather than hidden.
 */
export type ProjectUpdateInput = Omit<
  Partial<ProjectResponse>,
  'widget_config'
> & {
  /** Object, not a serialized string. Send `null` to reset to defaults. */
  widget_config?: Record<string, unknown> | null;
};

export function useUpdateProject(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProjectUpdateInput) =>
      api<ProjectResponse>(`/projects/${projectId}`, {method: 'PATCH', body}),
    onSuccess: () => {
      void qc.invalidateQueries({queryKey: ['project', projectId]});
      void qc.invalidateQueries({queryKey: [...orgKey(), 'projects']});
      void qc.invalidateQueries({queryKey: ['widget-config', null]});
    },
  });
}

export function useRotateKey(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<ProjectCreatedResponse>(`/projects/${projectId}/keys/rotate`, {method: 'POST'}),
    onSuccess: () => {
      void qc.invalidateQueries({queryKey: [...orgKey(), 'projects']});
    },
  });
}

export function useDomains(projectId: string | null) {
  return useQuery({
    queryKey: ['domains', projectId],
    queryFn: () => api<ProjectDomainResponse[]>(`/projects/${projectId}/domains`),
    enabled: Boolean(projectId),
  });
}

export function useAddDomain(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (host: string) =>
      api<ProjectDomainResponse>(`/projects/${projectId}/domains`, {
        method: 'POST',
        body: {host},
      }),
    onSuccess: () => {
      void qc.invalidateQueries({queryKey: ['domains', projectId]});
    },
  });
}

export function useRemoveDomain(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domainId: string) =>
      api<void>(`/projects/${projectId}/domains/${domainId}`, {method: 'DELETE'}),
    onSuccess: () => {
      void qc.invalidateQueries({queryKey: ['domains', projectId]});
    },
  });
}

export function useDocuments(projectId: string | null) {
  return useQuery({
    queryKey: ['documents', projectId],
    queryFn: () => api<DocumentResponse[]>(`/projects/${projectId}/documents`),
    enabled: Boolean(projectId),
    // Documents move from pending to ready in the background, so the badge
    // would otherwise freeze at "pending" until a manual reload.
    refetchInterval: 15_000,
  });
}

export function useAddUrlDocument(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {url: string; title?: string}) =>
      api<DocumentResponse>(`/projects/${projectId}/documents/url`, {method: 'POST', body}),
    onSuccess: () => {
      void qc.invalidateQueries({queryKey: ['documents', projectId]});
    },
  });
}

export function useDeleteDocument(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      api<void>(`/projects/${projectId}/documents/${documentId}`, {method: 'DELETE'}),
    onSuccess: () => {
      void qc.invalidateQueries({queryKey: ['documents', projectId]});
    },
  });
}

export function useReindexDocument(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      api<{document_id: string; status: string}>(
        `/projects/${projectId}/documents/${documentId}/reindex`,
        {method: 'POST'},
      ),
    onSuccess: () => {
      void qc.invalidateQueries({queryKey: ['documents', projectId]});
    },
  });
}

/**
 * Upload a file as multipart.
 *
 * Not routed through api() because that helper JSON-encodes every body, and
 * sending a JSON-quoted file produces a corrupt upload rather than a clear
 * error. The bearer token is attached the same way.
 */
export async function uploadDocument(
  projectId: string,
  file: File,
): Promise<DocumentResponse> {
  const form = new FormData();
  form.append('file', file);

  const headers: Record<string, string> = {};
  if (tokens.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;
  // Required: this is an org-scoped route, and without the header the backend
  // answers 400 before it ever looks at the file.
  const orgId = getActiveOrgId();
  if (orgId) headers['X-Org-Id'] = orgId;

  const res = await fetch(`${API_PREFIX}/projects/${projectId}/documents/upload`, {
    method: 'POST',
    headers,
    // No Content-Type: the browser must set the multipart boundary itself.
    credentials: 'include',
    body: form,
  });
  if (!res.ok) {
    // The backend explains why: a 10MB file, an unsupported extension, a plan
    // quota, a document limit. "Upload failed with status 413" leaves the tenant
    // guessing, and the detail is already in the body.
    const detail = await res
      .json()
      .then((body: unknown) =>
        typeof (body as {detail?: unknown})?.detail === 'string'
          ? (body as {detail: string}).detail
          : '',
      )
      .catch(() => '');
    throw new Error(detail || `Upload failed with status ${res.status}`);
  }
  return (await res.json()) as DocumentResponse;
}

export function useConversations(projectId: string | null) {
  return useQuery({
    queryKey: ['conversations', projectId],
    queryFn: () =>
      api<ConversationResponse[]>(`/projects/${projectId}/conversations`),
    enabled: Boolean(projectId),
    // The inbox is meant to be live.
    refetchInterval: 10_000,
  });
}

export function useConversation(projectId: string | null, conversationId: string | null) {
  return useQuery({
    queryKey: ['conversation', projectId, conversationId],
    queryFn: () =>
      api<ConversationDetail>(`/projects/${projectId}/conversations/${conversationId}`),
    enabled: Boolean(projectId && conversationId),
  });
}

export function useTickets(projectId: string | null) {
  return useQuery({
    queryKey: ['tickets', projectId],
    queryFn: () => api<TicketResponse[]>(`/projects/${projectId}/tickets`),
    enabled: Boolean(projectId),
  });
}

export function useUpdateTicket(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {ticketId: string; body: {status?: string; assignee?: string}}) =>
      api<TicketResponse>(`/projects/${projectId}/tickets/${input.ticketId}`, {
        method: 'PATCH',
        body: input.body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({queryKey: ['tickets', projectId]});
    },
  });
}

export function useUsage() {
  return useQuery({
    queryKey: [...orgKey(), 'usage'],
    queryFn: () => api<UsageResponse>('/usage'),
  });
}

export function useMembers() {
  return useQuery({
    queryKey: [...orgKey(), 'members'],
    queryFn: () => api<MemberResponse[]>('/orgs'),
  });
}

export function useMe() {
  return useQuery({
    queryKey: [...orgKey(), 'me'],
    queryFn: () => api<MeResponse>('/auth/me'),
  });
}

/**
 * Public widget config, fetched the way the widget itself will.
 *
 * No auth header and no X-Org-Id: this is the same unauthenticated call
 * widget.js makes, so previewing it here exercises the real path rather than a
 * privileged one that the customer will never get.
 */
export function usePublicWidgetConfig(projectKey: string | null) {
  return useQuery({
    queryKey: ['widget-config', projectKey],
    queryFn: () => api<WidgetConfigResponse>(`/public/widget-config/${projectKey}`, {
      authenticated: false,
    }),
    enabled: Boolean(projectKey),
    retry: false,
  });
}