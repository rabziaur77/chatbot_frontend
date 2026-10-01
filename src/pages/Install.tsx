/**
 * Install: the embed snippet and domain verification.
 *
 * The snippet is only the script tag and the project key. Appearance is fetched
 * from /api/v1/public/widget-config/{key} at runtime, deliberately, so changing a
 * colour does not require every customer to re-embed and so tenant-controlled
 * strings never reach a page through markup the customer pasted.
 */

import {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import {Check, Copy, KeyRound, RotateCw, Trash2} from 'lucide-react';

import {ApiError} from '../lib/api';
import {
  useAddDomain,
  useDomains,
  useProject,
  useRemoveDomain,
  useRotateKey,
} from '../lib/queries';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  inputClass,
  Spinner,
} from '../components/ui';

const ORIGIN = window.location.origin;

/**
 * Keys are only ever returned by create or rotate, so cache the fresh one.
 *
 * sessionStorage rather than component state because the plaintext key has to
 * survive the reload that follows a rotation -- that reload is the only chance
 * the tenant gets to see it, since the server keeps just a hash.
 */
function useFreshKey(
  projectId: string | undefined,
): [string | null, (key: string, name: string) => void, () => void] {
  const storageKey = projectId ? `omni.newKey.${projectId}` : null;
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    if (!storageKey) return;
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      try {
        setKey(JSON.parse(raw).key as string);
      } catch {
        // Corrupt entry; treat it as absent.
        sessionStorage.removeItem(storageKey);
      }
    }
  }, [storageKey]);

  const store = (nextKey: string, name: string) => {
    if (storageKey) {
      sessionStorage.setItem(storageKey, JSON.stringify({name, key: nextKey}));
    }
    setKey(nextKey);
  };

  // Only ever called by the tenant, once they have actually copied it.
  const dismiss = () => {
    if (storageKey) sessionStorage.removeItem(storageKey);
    setKey(null);
  };

  return [key, store, dismiss];
}

function CopyButton({value, label}: {value: string; label: string}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard is unavailable over plain http on some browsers; the
          // textarea next to it is selectable either way.
        }
      }}
    >
      {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

export function InstallScreen() {
  const {projectId} = useParams();
  const project = useProject(projectId ?? null);
  const domains = useDomains(projectId ?? null);
  const addDomain = useAddDomain(projectId ?? null);
  const removeDomain = useRemoveDomain(projectId ?? null);
  const rotateKey = useRotateKey(projectId ?? null);
  const [freshKey, storeFreshKey, dismissKey] = useFreshKey(projectId);
  const [host, setHost] = useState('');
  const [error, setError] = useState<ApiError | null>(null);

  if (project.isPending) return <Spinner />;
  if (project.isError || !project.data) {
    return <ErrorNote message={project.error instanceof ApiError ? project.error.message : 'Failed to load project'} />;
  }

  const snippet = `<script src="${ORIGIN}/widget.js"\n        data-project-key="${freshKey ?? 'pk_live_...'}" async defer></script>`;

  async function onAddDomain(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await addDomain.mutateAsync(host);
      setHost('');
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
    }
  }

  return (
    <>
      {freshKey && (
        <Card>
          <div className="flex items-start gap-3">
            <KeyRound size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-slate-900">
                Save this key now
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                The project key is only ever shown in full right after it is
                created or rotated. The server stores a hash, so it cannot be
                recovered later.
              </p>
              <code className="mt-2 block break-all rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs text-emerald-300">
                {freshKey}
              </code>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" onClick={dismissKey}>
              I have saved it
            </Button>
          </div>
        </Card>
      )}

      <Card
        title="Embed snippet"
        description="Paste this just before the closing body tag."
      >
        <pre className="overflow-x-auto rounded-lg bg-slate-900 px-4 py-3 font-mono text-xs leading-relaxed text-slate-100">
          {snippet}
        </pre>
        <div className="mt-3 flex items-center gap-2">
          <CopyButton value={snippet} label="Copy snippet" />
          <CopyButton value={freshKey ?? ''} label="Copy key" />
          <Button
            variant="ghost"
            className="ml-auto"
            busy={rotateKey.isPending}
            onClick={async () => {
              setError(null);
              try {
                const rotated = await rotateKey.mutateAsync();
                // Persist before anything else. The previous version called
                // dismissKey() here, which deleted the only copy of a key the
                // server will never show again -- the reload then left the tenant
                // with a project they could not embed.
                storeFreshKey(rotated.public_key, rotated.name);
                // Remount so the snippet picks the new key up.
                window.location.reload();
              } catch (err) {
                setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
              }
            }}
          >
            <RotateCw size={15} aria-hidden />
            Rotate key
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Rotating breaks every live embed until customers update the snippet.
          Theme, title and greeting are fetched from your server, so they can be
          changed later without re-embedding.
        </p>
      </Card>

      <Card
        title="Allowed domains"
        description="Once you add a domain, the widget refuses to load from anywhere else."
      >
        <form onSubmit={onAddDomain} className="flex items-end gap-3">
          <div className="flex-1">
            <Field
              label="Host"
              htmlFor="domain-host"
              hint="Host only. The scheme and any path are stripped for you."
            >
              <input
                id="domain-host"
                required
                placeholder="www.example.com"
                className={inputClass}
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
            </Field>
          </div>
          <Button type="submit" busy={addDomain.isPending}>
            Add
          </Button>
        </form>
        {error && (
          <div className="mt-3">
            <ErrorNote message={error.message} issues={error.issues} />
          </div>
        )}

        <div className="mt-4">
          {domains.isPending ? (
            <Spinner />
          ) : !domains.data?.length ? (
            <EmptyState
              title="No domains yet"
              description="With no domains the widget loads from anywhere. That is convenient while you build, and a risk once the key is public."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {domains.data.map((domain) => (
                <li key={domain.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="font-mono text-sm text-slate-800">{domain.host}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {domain.verified_at
                        ? `Verified ${new Date(domain.verified_at).toLocaleDateString()}`
                        : 'Pending DNS verification'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      setError(null);
                      try {
                        await removeDomain.mutateAsync(domain.id);
                      } catch (err) {
                        setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
                      }
                    }}
                    aria-label={`Remove ${domain.host}`}
                  >
                    <Trash2 size={15} aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </>
  );
}