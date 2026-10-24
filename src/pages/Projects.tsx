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
  const [selectedPlan, setSelectedPlan] = useState<'trial' | 'pro' | 'enterprise'>('pro');
  const [selectedMonths, setSelectedMonths] = useState<1 | 3 | 6 | 12>(1);
  const [priceQuote, setPriceQuote] = useState<{amount_minor: number; currency: string} | null>(
    null,
  );
  const [quoteError, setQuoteError] = useState<string | null>(null);
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
    setSelectedPlan(activeOrg?.pending_plan ?? 'pro');
    setSelectedMonths(
      activeOrg?.pending_plan_months === 3 ||
        activeOrg?.pending_plan_months === 6 ||
        activeOrg?.pending_plan_months === 12
        ? activeOrg.pending_plan_months
        : 1,
    );
    if (activeOrg?.billing_provider) {
      setBillingRegion(activeOrg.billing_provider === 'razorpay' ? 'india' : 'international');
    }
  }, [
    activeOrg?.id,
    activeOrg?.pending_plan,
    activeOrg?.pending_plan_months,
    activeOrg?.billing_provider,
  ]);

  useEffect(() => {
    if (!activeOrg || selectedPlan === 'trial') {
      setPriceQuote(null);
      setQuoteError(null);
      return;
    }
    let current = true;
    setPriceQuote(null);
    setQuoteError(null);
    void api<{amount_minor: number; currency: string}>('/billing/quote', {
      authenticated: false,
      query: {
        plan: selectedPlan,
        provider: billingRegion === 'india' ? 'razorpay' : 'paypal',
        months: selectedMonths,
      },
    })
      .then((quote) => {
        if (current) setPriceQuote(quote);
      })
      .catch((err: unknown) => {
        if (current) {
          setQuoteError(err instanceof ApiError ? err.message : 'Unable to load the current price.');
        }
      });
    return () => {
      current = false;
    };
  }, [activeOrg?.id, selectedPlan, selectedMonths, billingRegion]);

  useEffect(() => {
    const checkoutError = sessionStorage.getItem('omni.billingCheckoutError');
    if (checkoutError) {
      setBillingError(new ApiError(0, checkoutError));
      sessionStorage.removeItem('omni.billingCheckoutError');
    }
  }, []);

  async function onChooseAndCheckout() {
    setStartingCheckout(true);
    setBillingError(null);
    try {
      const selection = await api<{
        plan: 'trial' | 'pro' | 'enterprise';
        pending_plan: 'trial' | 'pro' | 'enterprise' | null;
        pending_plan_months: number | null;
        billing_provider: 'razorpay' | 'paypal' | null;
      }>('/billing/selection', {
        method: 'POST',
        body: {
          plan: selectedPlan,
          ...(selectedPlan === 'trial'
            ? {}
            : {
                billing_provider: billingRegion === 'india' ? 'razorpay' : 'paypal',
                months: selectedMonths,
              }),
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
                  pending_plan_months: selection.pending_plan_months,
                  billing_provider: selection.billing_provider,
                }
              : org,
          ),
        });
      }
      if (selectedPlan === 'trial') {
        setStartingCheckout(false);
        return;
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
      window.location.assign(`${import.meta.env.BASE_URL}p/${created.id}/install`);
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
              {activeOrg.plan_expires_at && activeOrg.plan !== 'trial' && (
                <p className="text-xs text-slate-500">
                  Access through {new Date(activeOrg.plan_expires_at).toLocaleDateString()}.
                </p>
              )}
              {activeOrg.billing_attention_required && (
                <p className="text-xs text-amber-700">
                  Your current access is preserved while we reconcile your legacy subscription. Please contact support before making another billing change.
                </p>
              )}
              {activeOrg.billing_payment_attention_required && (
                <p className="text-xs text-amber-700">
                  A payment refund, reversal, or dispute needs review. Existing access is unchanged while support reviews the provider event.
                </p>
              )}
              {activeOrg.role === 'owner' && activeOrg.plan === 'trial' && (
                <p className="text-slate-700">
                  Selected plan:{' '}
                  <span className="font-semibold capitalize">{selectedPlan}</span>
                  {selectedPlan !== 'trial' &&
                    ` for ${selectedMonths} month${selectedMonths === 1 ? '' : 's'}`}
                </p>
              )}
              {activeOrg.pending_plan && (
                <p className="text-xs text-amber-700">
                  Pending checkout: {activeOrg.pending_plan}
                  {activeOrg.pending_plan_months
                    ? ` for ${activeOrg.pending_plan_months} month${activeOrg.pending_plan_months === 1 ? '' : 's'}`
                    : ''}. Current access stays on the current plan until a verified payment succeeds.
                </p>
              )}
              {!activeOrg.pending_plan && activeOrg.plan === 'trial' && (
                <p className="text-xs text-slate-500">Select a paid plan to continue to secure checkout.</p>
              )}
            </div>
          </div>
          {activeOrg.role === 'owner' && activeOrg.plan === 'trial' && (
            <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
              <label className="min-w-44 flex-1 space-y-1.5 text-sm font-medium text-slate-700">
                Selected plan
                <select
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  value={selectedPlan}
                  onChange={(event) =>
                    setSelectedPlan(event.target.value as 'trial' | 'pro' | 'enterprise')
                  }
                >
                  <option value="trial">Trial</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </label>
              {selectedPlan !== 'trial' && (
                <>
                  <label className="min-w-36 flex-1 space-y-1.5 text-sm font-medium text-slate-700">
                    Purchase duration
                    <select
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                      value={selectedMonths}
                      onChange={(event) =>
                        setSelectedMonths(Number(event.target.value) as 1 | 3 | 6 | 12)
                      }
                    >
                      <option value={1}>1 month</option>
                      <option value={3}>3 months</option>
                      <option value={6}>6 months</option>
                      <option value={12}>12 months</option>
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
                </>
              )}
              <div className="min-w-44 text-sm text-slate-600" aria-live="polite">
                {selectedPlan === 'trial' ? (
                  'No payment is required for Trial.'
                ) : priceQuote ? (
                  `One-time total: ${new Intl.NumberFormat(undefined, {
                    style: 'currency',
                    currency: priceQuote.currency,
                  }).format(priceQuote.amount_minor / 100)}`
                ) : quoteError ? (
                  <span className="text-rose-700">{quoteError}</span>
                ) : (
                  'Calculating total…'
                )}
              </div>
              <Button
                busy={startingCheckout}
                onClick={() => void onChooseAndCheckout()}
                disabled={selectedPlan !== 'trial' && priceQuote === null}
              >
                {selectedPlan === 'trial'
                  ? 'Return to Trial'
                  : activeOrg.pending_plan === selectedPlan &&
                      activeOrg.pending_plan_months === selectedMonths &&
                      activeOrg.billing_provider ===
                        (billingRegion === 'india' ? 'razorpay' : 'paypal')
                    ? 'Continue to payment'
                    : activeOrg.pending_plan
                      ? 'Update selection and checkout'
                      : 'Select plan and checkout'}
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