import {useState, type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {FolderPlus} from 'lucide-react';

import {ApiError} from '../lib/api';
import {useAuth} from '../lib/auth';
import {useCreateProject, useProjects} from '../lib/queries';
import {Button, Card, EmptyState, ErrorNote, Field, inputClass, Spinner} from '../components/ui';

export function ProjectsScreen() {
  const {activeOrg} = useAuth();
  const projects = useProjects();
  const createProject = useCreateProject();
  const [name, setName] = useState('');
  const [error, setError] = useState<ApiError | null>(null);

  // Creating a project is OrgAdmin on the server. A plain member still gets the
  // list, because viewing a project they belong to is legitimate, but offering a
  // create form that always 403s reads as a broken dashboard rather than a
  // permission boundary.
  const canCreate =
    activeOrg === null || activeOrg.role === 'owner' || activeOrg.role === 'admin';

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const created = await createProject.mutateAsync(name);
      // The plaintext key is returned exactly once, at creation. Losing it
      // means rotating, which breaks every live embed, so it is captured
      // before navigating away.
      sessionStorage.setItem(
        `omni.newKey.${created.id}`,
        JSON.stringify({name: created.name, key: created.public_key}),
      );
      setName('');
      window.location.assign(`/p/${created.id}/install`);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Projects</h1>
          <p className="text-sm text-slate-500">
            Each project has its own widget key, knowledge base and prompts.
          </p>
        </div>
      </div>

      {canCreate && (
        <Card title="New project">
          <form onSubmit={onCreate} className="flex items-end gap-3">
            <div className="flex-1">
              <Field label="Project name" htmlFor="new-project">
                <input
                  id="new-project"
                  required
                  maxLength={200}
                  className={inputClass}
                  placeholder="Acme Support"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
            </div>
            <Button type="submit" busy={createProject.isPending}>
              <FolderPlus size={15} aria-hidden />
              Create
            </Button>
          </form>
          {error && (
            <div className="mt-3">
              <ErrorNote message={error.message} issues={error.issues} />
            </div>
          )}
        </Card>
      )}

      <Card title="Your projects">
        {projects.isPending ? (
          <Spinner />
        ) : projects.isError ? (
          <ErrorNote
            message={projects.error instanceof ApiError ? projects.error.message : 'Failed to load projects'}
          />
        ) : !projects.data?.length ? (
          <EmptyState
            title="No projects yet"
            description="Create one above to get an embeddable widget and a place to add documents."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {projects.data.map((project) => (
              <li key={project.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <Link
                    to={`/p/${project.id}/install`}
                    className="text-sm font-medium text-slate-900 hover:text-blue-600"
                  >
                    {project.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {project.is_active ? 'Active' : 'Disabled'} · created{' '}
                    {new Date(project.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Link
                  to={`/p/${project.id}/install`}
                  className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}