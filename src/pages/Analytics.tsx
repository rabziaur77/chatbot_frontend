/**
 * Analytics: monthly quota consumption.
 *
 * The backend serves one month's counters, so there is no time series to draw
 * yet and this shows a single period rather than a fake chart. The numbers come
 * from the same PLAN_LIMITS table the backend enforces with, so a bar at 100%
 * really does mean the next message is rejected.
 */

import {useAuth} from '../lib/auth';
import {ApiError} from '../lib/api';
import {useProjects, useUsage} from '../lib/queries';
import {Card, ErrorNote, Spinner} from '../components/ui';

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function AnalyticsScreen() {
  const {activeOrg} = useAuth();
  const usage = useUsage();
  const projects = useProjects();

  if (usage.isPending) return <Spinner />;
  if (usage.isError || !usage.data) {
    return (
      <ErrorNote
        message={
          usage.error instanceof ApiError ? usage.error.message : 'Failed to load usage'
        }
      />
    );
  }

  const {data} = usage;
  const unlimited = data.messages_limit === null;
  const percent = data.messages_percent_used ?? 0;
  const plan = activeOrg?.plan ?? data.plan;

  return (
    <>
      <Card
        title="This month"
        description={`Period ${data.period}${activeOrg ? ` · ${activeOrg.name}` : ''}`}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric
            label="Messages"
            value={data.messages_used.toLocaleString()}
            sub={
              unlimited
                ? 'Unlimited on your plan'
                : `of ${data.messages_limit!.toLocaleString()} included`
            }
          />
          <Metric
            label="Conversations"
            value={data.conversations_started.toLocaleString()}
            sub="started this period"
          />
          <Metric label="Plan" value={plan} sub={`Key rotation and members included`} />
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between text-xs text-slate-600">
            <span>Monthly quota</span>
            <span className="tabular-nums">
              {unlimited
                ? 'no limit'
                : `${data.messages_remaining!.toLocaleString()} remaining`}
            </span>
          </div>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-valuenow={unlimited ? 0 : percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Monthly quota used"
          >
            <div
              className={`h-full rounded-full transition-[width] ${
                percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-blue-500'
              }`}
              style={{width: `${unlimited ? 0 : percent}%`}}
            />
          </div>
          {!unlimited && percent >= 90 && (
            <p className="mt-2 text-xs text-red-600">
              Close to the limit. Messages beyond it are rejected until the period
              rolls over.
            </p>
          )}
        </div>
      </Card>

      <Card title="Projects">
        {projects.isPending ? (
          <Spinner />
        ) : !projects.data?.length ? (
          <p className="text-sm text-slate-500">No projects yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {projects.data.map((project) => (
              <li key={project.id} className="flex items-center justify-between py-2.5">
                <a
                  href={`/p/${project.id}/analytics`}
                  className="text-sm font-medium text-slate-800 hover:text-blue-600"
                >
                  {project.name}
                </a>
                <span className="text-xs text-slate-500">
                  {project.is_active ? 'Active' : 'Disabled'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}