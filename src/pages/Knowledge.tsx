/**
 * Knowledge: upload, add by URL, and watch ingestion status.
 *
 * Ingestion is queued, so a document sits at "pending" until the worker picks
 * it up. The list refetches on an interval for that reason; without it the
 * status column would read "pending" forever and the screen would look broken.
 */

import {useRef, useState} from 'react';
import {useParams} from 'react-router-dom';
import {Link2, RefreshCw, Trash2} from 'lucide-react';

import {ApiError} from '../lib/api';
import {
  uploadDocument,
  useAddUrlDocument,
  useDeleteDocument,
  useDocuments,
  useReindexDocument,
} from '../lib/queries';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  inputClass,
  Spinner,
  StatusBadge,
} from '../components/ui';

const ACCEPT = '.pdf,.docx,.txt,.md,.markdown';

export function KnowledgeScreen() {
  const {projectId} = useParams();
  const documents = useDocuments(projectId ?? null);
  const addUrl = useAddUrlDocument(projectId ?? null);
  const remove = useDeleteDocument(projectId ?? null);
  const reindex = useReindexDocument(projectId ?? null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [url, setUrl] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [uploading, setUploading] = useState(false);

  async function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !projectId) return;
    setError(null);
    setUploading(true);
    try {
      await uploadDocument(projectId, file);
    } catch (err) {
      setError(new ApiError(0, err instanceof Error ? err.message : 'Upload failed'));
    } finally {
      setUploading(false);
      // Reset so re-selecting the same file fires change again.
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function onAddUrl(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await addUrl.mutateAsync({url});
      setUrl('');
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
    }
  }

  /**
   * Row actions have no other surface to report on, so the rejection has to land
   * here. `void someMutation(...)` discards it, which surfaces as an unhandled
   * rejection in the console and a button that appears to do nothing -- a delete
   * that was refused for lack of permission looks exactly like a delete that
   * silently failed.
   */
  async function run(
    mutation: {mutateAsync: (id: string) => Promise<unknown>},
    documentId: string,
  ) {
    setError(null);
    try {
      await mutation.mutateAsync(documentId);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
    }
  }

  return (
    <>
      <Card
        title="Add a document"
        description="PDF, DOCX, Markdown or plain text. Ingestion runs in the background."
      >
        <div className="space-y-4">
          <div>
            <Field label="Upload a file" htmlFor="file-upload">
              <input
                id="file-upload"
                ref={fileInput}
                type="file"
                accept={ACCEPT}
                onChange={onUpload}
                disabled={uploading}
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
            </Field>
            {uploading && <p className="mt-1.5 text-xs text-slate-500">Uploading…</p>}
          </div>

          <form onSubmit={onAddUrl} className="flex items-end gap-3 border-t border-slate-100 pt-4">
            <div className="flex-1">
              <Field
                label="Or add a URL"
                htmlFor="doc-url"
                hint="The page is fetched and split server-side. Private addresses are rejected."
              >
                <input
                  id="doc-url"
                  required
                  type="url"
                  placeholder="https://example.com/docs/refunds"
                  className={inputClass}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </Field>
            </div>
            <Button type="submit" busy={addUrl.isPending}>
              <Link2 size={15} aria-hidden />
              Add
            </Button>
          </form>

          {error && <ErrorNote message={error.message} issues={error.issues} />}
        </div>
      </Card>

      <Card
        title="Documents"
        actions={
          <Button
            variant="ghost"
            onClick={() => void documents.refetch()}
            aria-label="Refresh documents"
          >
            <RefreshCw size={15} aria-hidden />
          </Button>
        }
      >
        {documents.isPending ? (
          <Spinner />
        ) : documents.isError ? (
          <ErrorNote
            message={
              documents.error instanceof ApiError
                ? documents.error.message
                : 'Failed to load documents'
            }
          />
        ) : !documents.data?.length ? (
          <EmptyState
            title="No documents yet"
            description="The assistant can only answer from these. Add a few sources and it will start citing them."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 font-medium">Title</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Chunks</th>
                <th className="py-2 pr-3 font-medium">Added</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.data.map((doc) => (
                <tr key={doc.id} className="align-top">
                  <td className="py-2.5 pr-3">
                    <p className="font-medium text-slate-800">{doc.title || doc.source_url || doc.id}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {doc.source_type}
                      {doc.source_url && (
                        <>
                          {' · '}
                          <a
                            href={doc.source_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-blue-600 hover:underline"
                          >
                            source
                          </a>
                        </>
                      )}
                    </p>
                    {doc.error && (
                      <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                        {doc.error}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <StatusBadge status={doc.status} />
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums text-slate-600">{doc.chunk_count}</td>
                  <td className="py-2.5 pr-3 text-xs text-slate-500">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        title="Re-embed and reindex"
                        onClick={() => void run(reindex, doc.id)}
                      >
                        <RefreshCw size={15} aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        title="Delete"
                        onClick={() => void run(remove, doc.id)}
                      >
                        <Trash2 size={15} aria-hidden />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}