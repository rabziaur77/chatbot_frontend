import {useEffect, useState, type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {FolderPlus} from 'lucide-react';

import {ApiError, api} from '../lib/api';
import {useAuth} from '../lib/auth';
import {useCreateProject, useProjects} from '../lib/queries';
import {Button, Card, EmptyState, ErrorNote, Field, inputClass, Spinner} from '../components/ui';

export function ProjectsScreen() {
  const {activeOrg, me, setMe} = useAuth();
  const projects = useProjects();
  const createProject = useCreateProject();
  const [name, setName] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [billingError, setBillingError] = useState<ApiError | null>(null);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'enterprise'>('pro');
  const [billingRegion, setBillingRegion] = useState<'india' | 'international'>(() =>
    navigator.language.toLowerCase().endsWith('-in') ? 'india' : 'international',
  );

  // Creating a project is OrgAdmin on the server. A plain member still gets the
  // list, because viewing a project they belong to is legitimate, but offering a
  // create form that always 403s reads as a broken dashboard rather than a
  // permission boundary.
  const canCreate =
    activeOrg === null || activeOrg.role === 'owner' || activeOrg.role === 'admin';

  useEffect(() => {
    const checkoutError = sessionStorage.getItem('omni.billingCheckoutError');
    if (checkoutError) {
      setBillingError(new ApiError(0, checkoutError));
      sessionStorage.removeItem('omni.billingCheckoutError');
    }
  }, []);

  async function onCheckout() {
    setStartingCheckout(true);
    setBillingError(null);
    try {
      const checkout = await api<{checkout_url: string}>('/billing/checkout', {
        method: 'POST',
      });
      window.location.assign(checkout.checkout_url);
    } catch (err) {
      setBillingError(err instanceof ApiError ? err : new ApiError(0, String(err)));
      setStartingCheckout(false);
    }
  }

  async function onChooseAndCheckout() {
    setStartingCheckout(true);
    setBillingError(null);
    try {
      const selection = await api<{
        plan: 'trial' | 'pro' | 'enterprise';
        pending_plan: 'trial' | 'pro' | 'enterprise' | null;
        billing_provider: 'razorpay' | 'paypal' | null;
      }>('/billing/selection', {
        method: 'POST',
        body: {
          plan: selectedPlan,
          billing_provider: billingRegion === 'india' ? 'razorpay' : 'paypal',
        },
      });
      if (me && activeOrg) {
        setMe({
          ...me,
          organizations: me.organizations.map((org) =>
            org.id === activeOrg.id
              ? {
                  ...org,
                  pending_plan: selection.pending_plan,
                  billing_provider: selection.billing_provider,
                }
              : org,
          ),
        });
      }
      const checkout = await api<{checkout_url: string}>('/billing/checkout', {
        method: 'POST',
      });
      window.location.assign(checkout.checkout_url);
    } catch (err) {
      setBillingError(err instanceof ApiError ? err : new ApiError(0, String(err)));
      setStartingCheckout(false);
    }
  }

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

      {activeOrg && (
        <Card title="Plan">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 text-sm">
              <p className="text-slate-700">
                Current plan: <span className="font-semibold capitalize">{activeOrg.plan}</span>
              </p>
              {activeOrg.pending_plan && (
                <p className="text-xs text-amber-700">
                  {activeOrg.pending_plan} selected · awaiting payment confirmation. Your account stays on Trial until payment succeeds.
                </p>
              )}
              {!activeOrg.pending_plan && activeOrg.plan === 'trial' && (
                <p className="text-xs text-slate-500">Select a paid plan to continue to secure checkout.</p>
              )}
            </div>
          </div>
          {activeOrg.role === 'owner' && activeOrg.pending_plan && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Checkout provider: {activeOrg.billing_provider ?? 'not selected'}
              </p>
              <Button busy={startingCheckout} onClick={() => void onCheckout()}>
                Continue to payment
              </Button>
            </div>
          )}
          {activeOrg.role === 'owner' && !activeOrg.pending_plan && activeOrg.plan === 'trial' && (
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
              <label className="min-w-44 flex-1 space-y-1.5 text-sm font-medium text-slate-700">
                Paid plan
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  value={selectedPlan}
                  onChange={(event) =>
                    setSelectedPlan(event.target.value as 'pro' | 'enterprise')
                  }
                >
                  <option value="pro">Pro — ₹999 / $19 monthly</option>
                  <option value="enterprise">Enterprise — ₹4,999 / $99 monthly</option>
                </select>
              </label>
              <label className="min-w-44 flex-1 space-y-1.5 text-sm font-medium text-slate-700">
                Billing country
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  value={billingRegion}
                  onChange={(event) =>
                    setBillingRegion(event.target.value as 'india' | 'international')
                  }
                >
                  <option value="india">India (Razorpay · INR)</option>
                  <option value="international">Other countries (PayPal · USD)</option>
                </select>
              </label>
              <Button busy={startingCheckout} onClick={() => void onChooseAndCheckout()}>
                Choose plan and pay
              </Button>
            </div>
          )}
          {billingError && (
            <div className="mt-3">
              <ErrorNote message={billingError.message} issues={billingError.issues} />
            </div>
          )}
        </Card>
      )}

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