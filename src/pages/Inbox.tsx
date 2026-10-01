/**
 * Inbox: conversations, transcripts and the handoff queue.
 *
 * The list refetches every 10 seconds rather than holding a dashboard
 * WebSocket open. That is a deliberate trade for now: the server already
 * publishes transcript events onto a Redis project channel, but nothing
 * subscribes yet, and polling one small endpoint is a smaller surface than a
 * second authenticated socket protocol.
 */

import {useState} from 'react';
import {useParams} from 'react-router-dom';
import {ExternalLink, Quote} from 'lucide-react';

import {ApiError} from '../lib/api';
import {
  useConversation,
  useConversations,
  useTickets,
  useUpdateTicket,
} from '../lib/queries';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Spinner,
  StatusBadge,
  inputClass,
} from '../components/ui';

type Tab = 'conversations' | 'tickets';

/**
 * Host of a visitor-supplied page URL, or null.
 *
 * `page_url` comes from the visitor's browser via the widget, so it is whatever
 * that page reported. `new URL()` throws on anything malformed and this is
 * called during render, so a bad value would blank the whole transcript pane --
 * and `rel="noreferrer noopener"` is kept on the link because the same untrusted
 * string is its href, and `javascript:` must never be one.
 */
function pageHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.host
      : null;
  } catch {
    return null;
  }
}

export function InboxScreen() {
  const {projectId} = useParams();
  const [tab, setTab] = useState<Tab>('conversations');
  const [selected, setSelected] = useState<string | null>(null);

  const conversations = useConversations(projectId ?? null);
  const tickets = useTickets(projectId ?? null);
  const transcript = useConversation(projectId ?? null, selected);
  const updateTicket = useUpdateTicket(projectId ?? null);

  const host = pageHost(transcript.data?.page_url);
  const [error, setError] = useState<ApiError | null>(null);

  /**
   * Ticket updates are fire-and-forget from the select and the assign box, so
   * the rejection has to be caught somewhere. Discarded, an invalid status or a
   * permission failure left the control showing the value the server had just
   * rejected.
   */
  async function onTicketChange(
    ticketId: string,
    patch: {status?: string; assignee?: string},
  ) {
    setError(null);
    try {
      await updateTicket.mutateAsync({ticketId, body: patch});
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
    }
  }

  return (
    <>
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {(['conversations', 'tickets'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
              tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            {key}
            {key === 'tickets' && tickets.data?.length ? (
              <span className="ml-1.5 text-xs text-slate-400">{tickets.data.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'conversations' ? (
        <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
          <Card title="Conversations">
            {conversations.isPending ? (
              <Spinner />
            ) : conversations.isError ? (
              <ErrorNote
                message={
                  conversations.error instanceof ApiError
                    ? conversations.error.message
                    : 'Failed to load conversations'
                }
              />
            ) : !conversations.data?.length ? (
              <EmptyState title="No conversations yet" />
            ) : (
              <ul className="-mx-2 max-h-[32rem] space-y-1 overflow-y-auto">
                {conversations.data.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      onClick={() => setSelected(conversation.id)}
                      className={`w-full rounded-lg px-2.5 py-2 text-left transition ${
                        selected === conversation.id
                          ? 'bg-blue-50 ring-1 ring-blue-200'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs text-slate-700">
                          {conversation.visitor_id}
                        </span>
                        {conversation.has_ticket && (
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            ticket
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {conversation.page_url ?? 'no page recorded'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {conversation.message_count} message
                        {conversation.message_count === 1 ? '' : 's'} ·{' '}
                        {new Date(conversation.started_at).toLocaleString()}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            {!selected ? (
              <EmptyState title="Select a conversation" />
            ) : transcript.isPending ? (
              <Spinner />
            ) : transcript.isError ? (
              <ErrorNote
                message={
                  transcript.error instanceof ApiError
                    ? transcript.error.message
                    : 'Failed to load transcript'
                }
              />
            ) : (
              <>
                <header className="mb-4 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
                  <span className="font-mono text-xs text-slate-600">
                    {transcript.data.visitor_id}
                  </span>
                  {host && transcript.data.page_url && (
                    <a
                      href={transcript.data.page_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                    >
                      {host}
                      <ExternalLink size={12} aria-hidden />
                    </a>
                  )}
                </header>

                <ol className="space-y-4">
                  {transcript.data.messages.map((message) => (
                    <li key={message.id}>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        {message.role}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                        {message.content}
                      </p>
                      {message.citations.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {message.citations.map((citation, i) => (
                            <li
                              key={`${citation.document_id}-${i}`}
                              className="flex items-start gap-1.5 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600"
                            >
                              <Quote size={11} className="mt-0.5 shrink-0" aria-hidden />
                              <span>
                                {citation.title}
                                {citation.section && ` · ${citation.section}`}
                                <span className="ml-1 text-slate-400">
                                  {citation.score.toFixed(2)}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {message.latency_ms != null && (
                        <p className="mt-1 text-[11px] text-slate-400">
                          {message.latency_ms} ms
                          {message.model && ` · ${message.model}`}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </Card>
        </div>
      ) : (
        <Card title="Handoff tickets">
          {tickets.isPending ? (
            <Spinner />
          ) : tickets.isError ? (
            <ErrorNote
              message={
                tickets.error instanceof ApiError
                  ? tickets.error.message
                  : 'Failed to load tickets'
              }
            />
          ) : !tickets.data?.length ? (
            <EmptyState
              title="No tickets"
              description="Tickets appear when a visitor asks for a human."
            />
          ) : (
            <ul className="space-y-3">
              {tickets.data.map((ticket) => (
                <li
                  key={ticket.id}
                  className="rounded-lg border border-slate-200 p-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {ticket.subject}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {ticket.visitor_id} ·{' '}
                        {new Date(ticket.created_at).toLocaleString()}
                        {ticket.urgency === 'high' && (
                          <span className="ml-2 font-medium text-red-600">
                            high urgency
                          </span>
                        )}
                      </p>
                    </div>
                    <StatusBadge status={ticket.status} />
                  </div>

                  {ticket.summary && (
                    <p className="mt-2 text-sm text-slate-600">{ticket.summary}</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Status for ${ticket.subject}`}
                      className={`${inputClass} w-auto`}
                      value={ticket.status}
                      onChange={(e) =>
                        void onTicketChange(ticket.id, {status: e.target.value})
                      }
                    >
                      <option value="open">open</option>
                      <option value="assigned">assigned</option>
                      <option value="resolved">resolved</option>
                    </select>
                    <input
                      aria-label={`Assignee for ${ticket.subject}`}
                      placeholder="assign to"
                      className={`${inputClass} w-40`}
                      defaultValue={ticket.assignee ?? ''}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next !== (ticket.assignee ?? '')) {
                          void onTicketChange(ticket.id, {assignee: next});
                        }
                      }}
                    />
                    <Button
                      variant="ghost"
                      onClick={() => {
                        // Switch tabs too: selecting a conversation while the
                        // ticket list is showing leaves the click looking inert.
                        setSelected(ticket.conversation_id);
                        setTab('conversations');
                      }}
                    >
                      View transcript
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <div className="mt-3">
              <ErrorNote message={error.message} issues={error.issues} />
            </div>
          )}
        </Card>
      )}
    </>
  );
}