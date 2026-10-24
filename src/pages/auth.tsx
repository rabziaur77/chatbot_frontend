import {useEffect, useState, type FormEvent} from 'react';
import {Link, useSearchParams} from 'react-router-dom';

import {useAuth} from '../lib/auth';
import {ApiError, api} from '../lib/api';
import {Button, ErrorNote, Field, inputClass} from '../components/ui';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        <div className="mt-6">{children}</div>
        <div className="mt-5 text-sm text-slate-600">{footer}</div>
      </div>
    </div>
  );
}

export function LoginScreen() {
  const {signIn} = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      window.location.assign(`${import.meta.env.BASE_URL}projects`);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Manage your support widget and knowledge base."
      footer={
        <>
          No account?{' '}
          <Link to="/signup" className="font-medium text-blue-600 hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorNote message={error.message} issues={error.issues} />}
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" busy={busy} className="w-full">
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

export function SignupScreen() {
  const {signUp} = useAuth();
  const [searchParams] = useSearchParams();
  const [requestedPlan, setRequestedPlan] = useState<'trial' | 'pro' | 'enterprise'>(() => {
    const plan = searchParams.get('plan');
    return plan === 'pro' || plan === 'enterprise' ? plan : 'trial';
  });
  const [requestedMonths, setRequestedMonths] = useState<1 | 3 | 6 | 12>(1);
  const [billingRegion, setBillingRegion] = useState<'india' | 'international'>(() =>
    navigator.language.toLowerCase().endsWith('-in') ? 'india' : 'international',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [priceQuote, setPriceQuote] = useState<{amount_minor: number; currency: string} | null>(
    null,
  );
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Mirrors the server-side constraint so the user is told before submitting.
  const passwordTooShort = password.length > 0 && password.length < 10;

  useEffect(() => {
    if (requestedPlan === 'trial') {
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
        plan: requestedPlan,
        provider: billingRegion === 'india' ? 'razorpay' : 'paypal',
        months: requestedMonths,
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
  }, [requestedPlan, requestedMonths, billingRegion]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signUp({
        email,
        password,
        name: name || undefined,
        organization_name: organizationName,
        requested_plan: requestedPlan,
        ...(requestedPlan !== 'trial'
          ? {
              billing_provider: billingRegion === 'india' ? 'razorpay' : 'paypal',
              requested_months: requestedMonths,
            }
          : {}),
      });
      if (requestedPlan !== 'trial') {
        try {
          const checkout = await api<{checkout_url: string}>('/billing/checkout', {
            method: 'POST',
          });
          window.location.assign(checkout.checkout_url);
          return;
        } catch (err) {
          // The organization is created with the paid plan pending, not active.
          // Settings keeps a retry button if provider credentials are not ready.
          const checkoutError =
            err instanceof ApiError ? err.message : 'Could not start the payment checkout.';
          sessionStorage.setItem('omni.billingCheckoutError', checkoutError);
          window.location.assign(`${import.meta.env.BASE_URL}projects`);
          return;
        }
      }
      window.location.assign(`${import.meta.env.BASE_URL}projects`);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle={
        requestedPlan === 'trial'
          ? 'You will become the owner of a new organization.'
          : `Selected plan: ${requestedPlan === 'pro' ? 'Pro' : 'Enterprise'} for ${requestedMonths} month${requestedMonths === 1 ? '' : 's'}. Access starts after payment is confirmed.`
      }
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-blue-600 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorNote message={error.message} issues={error.issues} />}
        <Field label="Plan" htmlFor="signup-plan">
          <select
            id="signup-plan"
            className={inputClass}
            value={requestedPlan}
            onChange={(event) =>
              setRequestedPlan(event.target.value as 'trial' | 'pro' | 'enterprise')
            }
          >
            <option value="trial">Trial — free for 14 days</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </Field>
        {requestedPlan !== 'trial' && (
          <Field label="Purchase duration" htmlFor="signup-months">
            <select
              id="signup-months"
              className={inputClass}
              value={requestedMonths}
              onChange={(event) =>
                setRequestedMonths(Number(event.target.value) as 1 | 3 | 6 | 12)
              }
            >
              <option value={1}>1 month</option>
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
            </select>
          </Field>
        )}
        {requestedPlan !== 'trial' && (
          <Field
            label="Billing country"
            htmlFor="billing-region"
            hint={
              priceQuote
                ? `One-time total: ${new Intl.NumberFormat(undefined, {
                    style: 'currency',
                    currency: priceQuote.currency,
                  }).format(priceQuote.amount_minor / 100)} through ${
                    billingRegion === 'india' ? 'Razorpay' : 'PayPal'
                  }.`
                : quoteError
                  ? quoteError
                  : 'Calculating the server price…'
            }
          >
            <select
              id="billing-region"
              className={inputClass}
              value={billingRegion}
              onChange={(event) =>
                setBillingRegion(event.target.value as 'india' | 'international')
              }
            >
              <option value="india">India (INR)</option>
              <option value="international">Other countries (USD)</option>
            </select>
          </Field>
        )}
        <Field label="Work email" htmlFor="signup-email">
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            required
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Your name" htmlFor="signup-name" hint="Optional.">
          <input
            id="signup-name"
            autoComplete="name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Organization name" htmlFor="signup-org">
          <input
            id="signup-org"
            required
            className={inputClass}
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
          />
        </Field>
        <Field
          label="Password"
          htmlFor="signup-password"
          error={passwordTooShort ? 'Use at least 10 characters.' : undefined}
        >
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" busy={busy} className="w-full">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}