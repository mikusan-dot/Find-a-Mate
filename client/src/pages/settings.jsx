import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, ShieldCheck, Trash2 } from 'lucide-react';
import { ApiError, api, authMessage, useAuth } from '../firebase/auth.jsx';
import { Badge, Button, Card, ConfirmDialog, ErrorState, Field, Input, PageHeader, Select, Skeleton, Toggle, VerifiedBadge, useAsync, useToast } from '../components/index.jsx';
import { DISCOVERY, PRIVACY_FIELDS, VISIBILITY } from '../lib/constants.js';

const Tabs = ({ active }) => (
  <nav className="mb-6 flex gap-1 overflow-x-auto" aria-label="Settings sections">
    {[['/settings', 'General'], ['/settings/privacy', 'Privacy'], ['/settings/security', 'Security']].map(([to, label]) => (
      <Link key={to} to={to} aria-current={active === to ? 'page' : undefined} className={`rounded-xl px-4 py-2 text-sm ${active === to ? 'bg-accent-soft text-accent-ink' : 'text-fg-3 hover:bg-sunk'}`}>{label}</Link>
    ))}
  </nav>
);

export function Settings() {
  const { me, loadMe, logout } = useAuth();
  const toast = useToast();
  const prefs = me.user.notifPrefs || {};
  const rows = [['matches', 'New matches'], ['messages', 'New messages'], ['interests', 'Someone is interested'], ['reports', 'Report status updates']];
  const set = async (k, v) => {
    try { await api('/settings/notifications', { method: 'PUT', body: { [k]: v } }); await loadMe(); } catch (e) { toast.error(e.message); }
  };
  return (
    <div>
      <PageHeader title="Settings" />
      <Tabs active="/settings" />
      <div className="space-y-6">
        <Card>
          <h2 className="mb-3 font-semibold text-fg">Account</h2>
          <p className="text-sm text-fg-2">{me.email}</p>
          <p className="mt-1"><VerifiedBadge university={me.university?.name} /></p>
          <p className="mt-2 text-xs text-fg-3">Your email and student ID are never shown to other users.</p>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-fg">Notifications</h2>
          <p className="mb-3 text-xs text-fg-3">Security notices are always on.</p>
          <div className="space-y-3">{rows.map(([k, label]) => <div key={k} className="flex items-center justify-between text-sm text-fg-2">{label}<Toggle label={label} checked={prefs[k] !== false} onChange={(v) => set(k, v)} /></div>)}</div>
        </Card>
        <Button variant="secondary" onClick={logout}>Sign out</Button>
      </div>
    </div>
  );
}

export function SettingsPrivacy() {
  const { me, loadMe, deleteAccount } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const p = me.profile;
  const blocks = useAsync(() => api('/blocks'), []);
  const [confirm, setConfirm] = useState(false);

  const save = async (body) => {
    try { await api('/profile/privacy', { method: 'PUT', body }); await loadMe(); toast.success('Saved.'); } catch (e) { toast.error(e.message); }
  };
  const unblock = async (uid) => { try { await api(`/blocks/${uid}`, { method: 'DELETE' }); blocks.reload(); } catch (e) { toast.error(e.message); } };
  const del = async () => {
    try { await deleteAccount(); toast.info('Your account has been deleted.'); nav('/', { replace: true }); } catch (e) { toast.error(e instanceof ApiError ? e.message : authMessage(e)); throw e; }
  };

  return (
    <div>
      <PageHeader title="Privacy Center" subtitle="You decide who sees what." />
      <Tabs active="/settings/privacy" />
      <div className="space-y-6">
        <Card>
          <h2 className="mb-1 font-semibold text-fg">Discovery</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup">
            {DISCOVERY.map((m) => (
              <button key={m.id} role="radio" aria-checked={p.discovery === m.id} onClick={() => save({ discovery: m.id })} className={`rounded-xl border p-3 text-left transition ${p.discovery === m.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunk'}`}>
                <span className="block text-sm font-medium text-fg">{m.label}</span><span className="mt-1 block text-xs text-fg-3">{m.desc}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="mb-1 font-semibold text-fg">Who can see…</h2>
          <p className="mb-4 text-xs text-fg-3">“Compatible matches” means people whose compatibility with you is 70% or more, plus your mutual matches.</p>
          <div className="space-y-3">
            {PRIVACY_FIELDS.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-4">
                <label htmlFor={`pv-${f.id}`} className="text-sm text-fg">{f.label}</label>
                <Select id={`pv-${f.id}`} className="w-48" value={p.privacy?.[f.id] || 'MATCHES'} onChange={(e) => save({ privacy: { [f.id]: e.target.value } })}>{VISIBILITY.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</Select>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 border-t border-line pt-3"><span className="text-sm text-fg">Student identity & email</span><Badge tone="good"><Lock size={12} /> NEVER PUBLIC</Badge></div>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-fg">Blocked people</h2>
          {blocks.loading ? <Skeleton className="h-12" /> : blocks.error ? <ErrorState error={blocks.error} onRetry={blocks.reload} /> : blocks.data.blocks.length === 0 ? <p className="text-sm text-fg-3">You haven't blocked anyone.</p> : (
            <ul className="space-y-2">{blocks.data.blocks.map((b) => <li key={b.uid} className="flex items-center justify-between text-sm text-fg-2">{b.alias}<Button size="sm" variant="secondary" onClick={() => unblock(b.uid)}>Unblock</Button></li>)}</ul>
          )}
        </Card>
        <Card className="border-bad/30">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-fg"><Trash2 size={17} className="text-bad" /> Delete account</h2>
          <p className="text-sm text-fg-3">This permanently deletes your profile, matches, conversations and messages, likes, passes, blocks, notifications and photos, and removes your login. Reports involving you are kept for safety. This cannot be undone.</p>
          <Button variant="outlineDanger" className="mt-4" onClick={() => setConfirm(true)}>Delete my account</Button>
        </Card>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={del} title="Delete your account?" confirmLabel="Delete forever" danger>You'll lose all matches and messages immediately. There is no way to recover them.</ConfirmDialog>
    </div>
  );
}

export function SettingsSecurity() {
  const { me, changePassword, logout } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const ok = f.current && f.next.length >= 8 && f.next === f.confirm && f.next !== f.current;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await changePassword(f.current, f.next); setF({ current: '', next: '', confirm: '' }); toast.success('Password updated.'); } catch (err) { toast.error(authMessage(err)); } finally { setBusy(false); }
  };
  return (
    <div>
      <PageHeader title="Security" />
      <Tabs active="/settings/security" />
      <div className="space-y-6">
        <Card>
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-fg"><ShieldCheck size={17} className="text-ok" /> Verification</h2>
          <p className="text-sm text-fg-2">{me.email}</p>
          <p className="mt-1 text-xs text-fg-3">Verified through your university email domain. We store only a one-way hash of your student ID.</p>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold text-fg">Change password</h2>
          <form onSubmit={submit} className="max-w-sm space-y-4">
            <Field label="Current password" htmlFor="cp"><Input id="cp" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></Field>
            <Field label="New password" htmlFor="np" hint="8+ characters"><Input id="np" type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></Field>
            <Field label="Confirm new password" htmlFor="np2" error={f.confirm && f.confirm !== f.next ? 'Passwords do not match' : ''}><Input id="np2" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
            <Button type="submit" loading={busy} disabled={!ok}>Update password</Button>
          </form>
        </Card>
        <Button variant="secondary" onClick={logout}>Sign out on this device</Button>
      </div>
    </div>
  );
}
