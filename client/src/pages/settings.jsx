import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, ShieldCheck, Trash2 } from 'lucide-react';
import { ApiError, api, authMessage, useAuth } from '../firebase/auth.jsx';
import { Badge, Button, Card, ConfirmDialog, ErrorState, Field, Input, PageHeader, Select, Skeleton, Toggle, VerifiedBadge, useAsync, useToast } from '../components/index.jsx';
import { DISCOVERY, PRIVACY_FIELDS, VISIBILITY } from '../lib/constants.js';

const Tabs = ({ active }) => (
  <nav className="mb-6 flex gap-1 overflow-x-auto" aria-label="Settings sections">
    {[['/settings', 'General'], ['/settings/privacy', 'Privacy'], ['/settings/security', 'Security']].map(([to, label]) => (
      <Link key={to} to={to} aria-current={active === to ? 'page' : undefined} className={`rounded-xl px-4 py-2 text-sm ${active === to ? 'bg-brand-500/15 text-brand-300' : 'text-slate-400 hover:bg-white/5'}`}>{label}</Link>
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
          <h2 className="mb-3 font-semibold text-white">Account</h2>
          <p className="text-sm text-slate-300">{me.email}</p>
          <p className="mt-1"><VerifiedBadge university={me.university?.name} /></p>
          <p className="mt-2 text-xs text-slate-500">Your email and student ID are never shown to other users.</p>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-white">Notifications</h2>
          <p className="mb-3 text-xs text-slate-500">Security notices are always on.</p>
          <div className="space-y-3">{rows.map(([k, label]) => <div key={k} className="flex items-center justify-between text-sm text-slate-300">{label}<Toggle label={label} checked={prefs[k] !== false} onChange={(v) => set(k, v)} /></div>)}</div>
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
          <h2 className="mb-1 font-semibold text-white">Discovery</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup">
            {DISCOVERY.map((m) => (
              <button key={m.id} role="radio" aria-checked={p.discovery === m.id} onClick={() => save({ discovery: m.id })} className={`rounded-xl border p-3 text-left transition ${p.discovery === m.id ? 'border-brand-400 bg-brand-500/15' : 'border-line hover:bg-white/5'}`}>
                <span className="block text-sm font-medium text-white">{m.label}</span><span className="mt-1 block text-xs text-slate-400">{m.desc}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="mb-1 font-semibold text-white">Who can see…</h2>
          <p className="mb-4 text-xs text-slate-500">“Compatible matches” means people whose compatibility with you is 70% or more, plus your mutual matches.</p>
          <div className="space-y-3">
            {PRIVACY_FIELDS.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-4">
                <label htmlFor={`pv-${f.id}`} className="text-sm text-slate-200">{f.label}</label>
                <Select id={`pv-${f.id}`} className="w-48" value={p.privacy?.[f.id] || 'MATCHES'} onChange={(e) => save({ privacy: { [f.id]: e.target.value } })}>{VISIBILITY.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</Select>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 border-t border-line pt-3"><span className="text-sm text-slate-200">Student identity & email</span><Badge tone="good"><Lock size={12} /> NEVER PUBLIC</Badge></div>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold text-white">Blocked people</h2>
          {blocks.loading ? <Skeleton className="h-12" /> : blocks.error ? <ErrorState error={blocks.error} onRetry={blocks.reload} /> : blocks.data.blocks.length === 0 ? <p className="text-sm text-slate-400">You haven't blocked anyone.</p> : (
            <ul className="space-y-2">{blocks.data.blocks.map((b) => <li key={b.uid} className="flex items-center justify-between text-sm text-slate-300">{b.alias}<Button size="sm" variant="secondary" onClick={() => unblock(b.uid)}>Unblock</Button></li>)}</ul>
          )}
        </Card>
        <Card className="border-red-500/20">
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-white"><Trash2 size={17} className="text-red-300" /> Delete account</h2>
          <p className="text-sm text-slate-400">This permanently deletes your profile, matches, conversations and messages, likes, passes, blocks, notifications and photos, and removes your login. Reports involving you are kept for safety. This cannot be undone.</p>
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
          <h2 className="mb-2 flex items-center gap-2 font-semibold text-white"><ShieldCheck size={17} className="text-emerald-300" /> Verification</h2>
          <p className="text-sm text-slate-300">{me.email}</p>
          <p className="mt-1 text-xs text-slate-500">Verified through your university email domain. We store only a one-way hash of your student ID.</p>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold text-white">Change password</h2>
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
