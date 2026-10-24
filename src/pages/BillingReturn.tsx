import {useCallback, useEffect, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {ArrowRight, CheckCircle2, Clock3, RefreshCw} from 'lucide-react';

import {ApiError, api} from '../lib/api';
import {Button, Card, ErrorNote, Spinner} from '../components/ui';

interface BillingStatus {
  plan: string;
  pending_plan: string | null;
  pending_plan_months: number | null;
  billing_provider: string | null;
  plan_expires_at: string | null;
  billing_attention_required: boolean;
  billing_payment_attention_required: boolean;
}

export function BillingReturnScreen() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('token');
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(
        await api<BillingStatus>(
          orderId ? '/billing/capture' : '/billing/status',
          orderId
            ? {method: 'POST', body: {order_id: orderId}}
            : undefined,
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <Card title="Payment status" description="Your access is time-limited to the duration you purchase. Payments do not renew automatically.">
        <div className="max-w-lg space-y-4">
          {loading ? (
            <Spinner label="Checking payment status" />
          ) : error ? (
            <ErrorNote message={error.message} issues={error.issues} />
          ) : status?.pending_plan ? (
            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <Clock3 size={18} className="mt-0.5 shrink-0" aria-hidden />
              <p>
                Payment is still being confirmed. Your selected plan is{' '}
                <span className="font-semibold capitalize">{status.pending_plan}</span>
                {status.pending_plan_months
                  ? ` for ${status.pending_plan_months} month${status.pending_plan_months === 1 ? '' : 's'}`
                  : ''}
                ; the purchase is awaiting confirmation. Your account remains on{' '}
                <span className="font-semibold capitalize">{status.plan}</span>{' '}
                until confirmation arrives.
              </p>
            </div>
          ) : status ? (
            <>
              {status.billing_attention_required ||
              status.billing_payment_attention_required ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Your billing account needs manual review. Existing access is unchanged while support verifies the provider record.
                </div>
              ) : (
                <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden />
                  <p>
                    Payment confirmed. Your active plan is{' '}
                    <span className="font-semibold capitalize">{status.plan}</span>.
                    {status.plan_expires_at && (
                      <> Access is available through {new Date(status.plan_expires_at).toLocaleDateString()}.</>
                    )}
                  </p>
                </div>
              )}
            </>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void refreshStatus()} busy={loading}>
              <RefreshCw size={15} aria-hidden />
              Refresh status
            </Button>
            <Link
              to="/projects"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Go to dashboard <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
        </div>
      </Card>
    </main>
  );
}
