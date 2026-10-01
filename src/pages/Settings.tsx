/**
 * Settings: organization, members and plan.
 *
 * Renaming is available to any member because the backend allows it; adding
 * members requires admin or owner and removing one requires owner, so those
 * controls are hidden where the server would refuse them rather than shown and
 * then failed. The UI mirrors the server's roles rather than being its own
 * source of truth, which is the only way the two stay in agreement.
 */

import {useEffect, useState} from 'react';
import {Shield, UserPlus} from 'lucide-react';

import {ApiError, api} from '../lib/api';
import {useAuth} from '../lib/auth';
import {useMembers, useUsage} from '../lib/queries';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  inputClass,
  Spinner,
} from '../components/ui';

export function SettingsScreen() {
  const {me, activeOrg, setMe} = useAuth();
  const members = useMembers();
  const usage = useUsage();

  const [name, setName] = useState(activeOrg?.name ?? '');
  const [savingOrg, setSavingOrg] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState('');

// Re-seed the field whenever the active org changes. A useState initialiser runs
// once, so without this the input kept the previous org's name and saving wrote
// it over the newly selected org -- the switch was in the header, nowhere near
// the form, so nothing on screen contradicted the name being edited.
useEffect(() => {
  setName(activeOrg?.name ?? '');
}, [activeOrg?.id, activeOrg?.name]);

if (!activeOrg) return <p className="text-sm text-slate-500">No organization selected.</p>;

const isOwner = activeOrg.role === 'owner';
const canAdminister = isOwner || activeOrg.role === 'admin';

  async function onRename(event: React.FormEvent) {
    event.preventDefault();
    setSavingOrg(true);
    setError(null);
    try {
      const updated = await api<{id: string; name: string; plan: string}>('/orgs', {
        method: 'PATCH',
        body: {name},
      });
      // Merged rather than replacing: PATCH /orgs omits slug, so replacing the
      // org object wholesale would drop it from the switcher.
      if (me) {
        setMe({
          ...me,
          organizations: me.organizations.map((org) =>
            org.id === updated.id ? {...org, name: updated.name} : org,
          ),
        });
      }
      setNotice('Organization renamed.');
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
    } finally {
      setSavingOrg(false);
    }
  }

  async function onInvite(event: React.FormEvent) {
    event.preventDefault();
    setInviting(true);
    setError(null);
    try {
      await api('/orgs/members', {
        method: 'POST',
        body: {email: inviteEmail, role: inviteRole},
      });
      setInviteEmail('');
      setNotice('Member added.');
      void members.refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
    } finally {
      setInviting(false);
    }
  }

  async function onRemove(userId: string) {
    setError(null);
    setRemoving(userId);
    try {
      await api(`/orgs/members/${userId}`, {method: 'DELETE'});
      setNotice('Member removed.');
      void members.refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <>
      <Card title="Organization">
        <form onSubmit={onRename} className="flex items-end gap-3">
          <div className="flex-1">
            <Field label="Name" htmlFor="org-name">
              <input
                id="org-name"
                required
                maxLength={200}
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </div>
          <Button type="submit" busy={savingOrg}>
            Save
          </Button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Slug: <span className="font-mono">{activeOrg.slug}</span> · your role:{' '}
          {activeOrg.role}
        </p>
      </Card>

      <Card title="Plan" description="Usage resets each calendar month.">
        {usage.isPending ? (
          <Spinner />
        ) : usage.data ? (
          <div className="space-y-1 text-sm text-slate-700">
            <p>
              Current plan: <span className="font-medium">{usage.data.plan}</span>
            </p>
            <p className="text-xs text-slate-500">
              {usage.data.messages_limit === null
                ? `${usage.data.messages_used.toLocaleString()} messages used this month (unlimited plan)`
                : `${usage.data.messages_used.toLocaleString()} of ${usage.data.messages_limit.toLocaleString()} messages used · resets ${usage.data.period}`}
            </p>
          </div>
        ) : null}
      </Card>

      <Card
        title="Members"
        description={
          canAdminister
            ? 'Add teammates by email. They need an account first.'
            : 'Only owners and admins can change the member list.'
        }
      >
        {members.isPending ? (
          <Spinner />
        ) : members.isError ? (
          <ErrorNote
            message={
              members.error instanceof ApiError
                ? members.error.message
                : 'Failed to load members'
            }
          />
        ) : !members.data?.length ? (
          <EmptyState title="No members" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {members.data.map((member) => (
              <li key={member.user_id} className="flex items-center gap-3 py-2.5">
                <Shield size={15} className="shrink-0 text-slate-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-800">
                    {member.name || member.email}
                  </p>
                  <p className="truncate text-xs text-slate-500">{member.email}</p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {member.role}
                </span>
                {isOwner && member.role === 'member' && (
                  <Button
                    variant="ghost"
                    busy={removing === member.user_id}
                    onClick={async () => {
                      await onRemove(member.user_id);
                    }}
                    aria-label={`Remove ${member.email}`}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canAdminister && (
          <form onSubmit={onInvite} className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
            <div className="min-w-48 flex-1">
              <Field label="Add member" htmlFor="invite-email">
                <input
                  id="invite-email"
                  type="email"
                  required
                  className={inputClass}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </Field>
            </div>
            <select
              aria-label="Role"
              className={`${inputClass} w-auto`}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
              {activeOrg.role === 'owner' && <option value="owner">owner</option>}
            </select>
            <Button type="submit" busy={inviting}>
              <UserPlus size={15} aria-hidden />
              Add
            </Button>
          </form>
        )}
      </Card>

      {(error || notice) && (
        <>
          {error && <ErrorNote message={error.message} issues={error.issues} />}
          {notice && (
            <p role="status" className="text-xs text-emerald-700">
              {notice}
            </p>
          )}
        </>
      )}
    </>
  );
}