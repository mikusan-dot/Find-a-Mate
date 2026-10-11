import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, useAuth } from '../firebase/auth.jsx';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton, Textarea, cn, useAsync, useToast } from '../components/index.jsx';
import { REPORT_CATEGORIES } from '../lib/constants.js';

const TABS = [['/admin', 'Dashboard', true], ['/admin/users', 'Users'], ['/admin/reports', 'Reports'], ['/admin/universities', 'Universities'], ['/admin/moderation', 'Moderation'], ['/admin/analytics', 'Analytics']];
const catLabel = (c) => REPORT_CATEGORIES.find(([id]) => id === c)?.[1] ?? c;
const when = (ms) => (ms ? new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '–');

export function AdminLayout() {
  const { me } = useAuth();
  return (
    <div>
      <PageHeader title="Admin" subtitle={`Signed in as ${me.role.replace('_', ' ').toLowerCase()}. Private conversations are never accessible here.`} />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line pb-2" aria-label="Admin sections">
        {TABS.map(([to, label, end]) => <NavLink key={to} to={to} end={end} className={({ isActive }) => cn('whitespace-nowrap rounded-xl px-3.5 py-2 text-sm', isActive ? 'bg-brand-500/15 text-brand-300' : 'text-slate-400 hover:bg-white/5')}>{label}</NavLink>)}
      </nav>
      <Outlet />
    </div>
  );
}

const Load = ({ q, children }) => (q.loading ? <Skeleton className="h-40" /> : q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : children(q.data));

export function AdminOverview() {
  const q = useAsync(() => api('/admin/stats'), []);
  return (
    <Load q={q}>{(s) => (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[['Total users', s.users], ['Verified students', s.verified], ['Pending verification', s.pending], ['Suspended', s.suspended], ['Active matches', s.activeMatches], ['Open reports', s.openReports]].map(([l, v]) => (
          <Card key={l}><p className="text-sm text-slate-400">{l}</p><p className="mt-1 text-3xl font-semibold text-white">{v}</p></Card>
        ))}
      </div>
    )}</Load>
  );
}

export function AdminUsers() {
  const { me } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState({ status: '', emailVerified: '' });
  const [pages, setPages] = useState([]);
  const q = useAsync(async () => {
    const params = new URLSearchParams(Object.entries(filter).filter(([, v]) => v));
    const r = await api(`/admin/users?${params}`);
    setPages([]);
    return r;
  }, [filter.status, filter.emailVerified]);
  const [target, setTarget] = useState(null); // { user, kind: 'suspend'|'reinstate'|'sensitive' }
  const [reason, setReason] = useState('');
  const [sensitive, setSensitive] = useState(null);

  const more = async () => {
    const last = pages.length ? pages[pages.length - 1].next : q.data.next;
    const params = new URLSearchParams(Object.entries({ ...filter, after: last }).filter(([, v]) => v));
    setPages([...pages, await api(`/admin/users?${params}`)]);
  };
  const all = q.data ? [...q.data.users, ...pages.flatMap((p) => p.users)] : [];
  const nextCursor = pages.length ? pages[pages.length - 1].next : q.data?.next;

  const run = async () => {
    const { user, kind } = target;
    try {
      if (kind === 'suspend') await api(`/admin/users/${user.uid}/suspend`, { method: 'POST', body: { reason } });
      else if (kind === 'reinstate') await api(`/admin/users/${user.uid}/reinstate`, { method: 'POST' });
      else setSensitive(await api(`/admin/users/${user.uid}/sensitive?reason=${encodeURIComponent(reason)}`));
      if (kind !== 'sensitive') { toast.success('Done.'); q.reload(); }
      setTarget(null); setReason('');
    } catch (e) { toast.error(e.message); }
  };
  const canAct = ['SUPER_ADMIN', 'MODERATOR'].includes(me.role);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select className="w-44" aria-label="Status" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></Select>
        <Select className="w-52" aria-label="Email verification" value={filter.emailVerified} onChange={(e) => setFilter({ ...filter, emailVerified: e.target.value })}><option value="">Any verification</option><option value="true">Verified</option><option value="false">Pending verification</option></Select>
      </div>
      <Load q={q}>{() => all.length === 0 ? <EmptyState title="No users match">Try changing the filters.</EmptyState> : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-800 text-xs uppercase text-slate-400"><tr>{['User', 'Dept', 'University', 'Status', 'Joined', ''].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {all.map((u) => (
                <tr key={u.uid} className="text-slate-300">
                  <td className="px-4 py-3"><span className="block text-white">{u.displayName || '–'}</span><span className="text-xs text-slate-500">{u.alias}</span></td>
                  <td className="px-4 py-3">{u.department || '–'}</td><td className="px-4 py-3 uppercase">{u.universityId}</td>
                  <td className="px-4 py-3"><Badge tone={u.status === 'SUSPENDED' ? 'bad' : u.emailVerified ? 'good' : 'warn'}>{u.status === 'SUSPENDED' ? 'Suspended' : u.emailVerified ? 'Verified' : 'Pending'}</Badge></td>
                  <td className="px-4 py-3 whitespace-nowrap">{when(u.createdAt)}</td>
                  <td className="space-x-2 px-4 py-3 text-right whitespace-nowrap">
                    {canAct && (u.status === 'SUSPENDED' ? <Button size="sm" variant="secondary" onClick={() => setTarget({ user: u, kind: 'reinstate' })}>Reinstate</Button> : <Button size="sm" variant="outlineDanger" onClick={() => setTarget({ user: u, kind: 'suspend' })}>Suspend</Button>)}
                    {me.role === 'SUPER_ADMIN' && <Button size="sm" variant="ghost" onClick={() => setTarget({ user: u, kind: 'sensitive' })}>View email</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}</Load>
      {nextCursor && <Button variant="secondary" onClick={more}>Load more</Button>}

      <Modal open={!!target && target.kind !== 'reinstate'} onClose={() => setTarget(null)} title={target?.kind === 'suspend' ? 'Suspend account' : 'Access sensitive data'}>
        <Field label="Reason" hint={target?.kind === 'sensitive' ? 'Required. This access is written to the audit log.' : 'Recorded in the audit log.'} htmlFor="why"><Textarea id="why" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button><Button variant={target?.kind === 'suspend' ? 'danger' : 'primary'} disabled={reason.trim().length < 5} onClick={run}>Confirm</Button></div>
      </Modal>
      <ConfirmDialog open={target?.kind === 'reinstate'} onClose={() => setTarget(null)} onConfirm={run} title="Reinstate account?" confirmLabel="Reinstate">The user can sign in again. Their ended matches stay ended.</ConfirmDialog>
      <Modal open={!!sensitive} onClose={() => setSensitive(null)} title="Sensitive details"><p className="text-sm text-slate-300">Email: <b className="text-white">{sensitive?.email}</b></p><p className="mt-1 text-xs text-slate-500">Last sign-in: {sensitive?.lastSignIn}</p><p className="mt-4 text-xs text-amber-300">This lookup was logged.</p></Modal>
    </div>
  );
}

export function AdminReports() {
  const { me } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState('OPEN');
  const q = useAsync(() => api(`/admin/reports?status=${status}`), [status]);
  const [open, setOpen] = useState(null);
  const detail = useAsync(() => (open ? api(`/admin/reports/${open}`) : Promise.resolve(null)), [open]);
  const [note, setNote] = useState('');
  const canAct = ['SUPER_ADMIN', 'MODERATOR'].includes(me.role);

  const resolve = async (action) => {
    try { await api(`/admin/reports/${open}/resolve`, { method: 'POST', body: { action, note } }); toast.success('Report updated.'); setOpen(null); setNote(''); q.reload(); } catch (e) { toast.error(e.message); }
  };
  return (
    <div className="space-y-4">
      <Select className="w-44" aria-label="Report status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="OPEN">Open</option><option value="RESOLVED">Resolved</option><option value="DISMISSED">Dismissed</option></Select>
      <Load q={q}>{(d) => d.reports.length === 0 ? <EmptyState title="No reports here">Nothing to review.</EmptyState> : (
        <div className="space-y-2">{d.reports.map((r) => (
          <button key={r.id} onClick={() => setOpen(r.id)} className="surface flex w-full items-center justify-between gap-3 rounded-xl p-4 text-left hover:bg-ink-700">
            <span><span className="block text-sm font-medium text-white">{catLabel(r.category)} · {r.reportedAlias}</span><span className="text-xs text-slate-400">{when(r.createdAt)}{r.hasEvidence ? ' · includes message excerpt' : ''}</span></span>
            <Badge tone={r.status === 'OPEN' ? 'warn' : 'neutral'}>{r.status}</Badge>
          </button>
        ))}</div>
      )}</Load>
      <Modal open={!!open} onClose={() => setOpen(null)} title="Report" wide>
        {detail.loading || !detail.data ? <Skeleton className="h-40" /> : (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2"><Badge tone="warn">{catLabel(detail.data.report.category)}</Badge><Badge>{detail.data.report.status}</Badge><Badge tone={detail.data.reported.openReports > 1 ? 'bad' : 'neutral'}>{detail.data.reported.openReports} open report(s) on this user</Badge></div>
            <p className="text-slate-300">Reported: <b className="text-white">{detail.data.reported.displayName || detail.data.reported.alias}</b> {detail.data.reported.department ? `(${detail.data.reported.department})` : ''}</p>
            {detail.data.report.details && <p className="rounded-xl bg-ink-900 p-3 text-slate-300">{detail.data.report.details}</p>}
            {detail.data.report.evidence.length > 0 && (
              <div><p className="mb-2 text-xs uppercase text-slate-500">Message excerpt shared by the reporter</p>
                <ul className="space-y-1.5">{detail.data.report.evidence.map((m, i) => <li key={i} className={cn('rounded-lg px-3 py-2', m.from === 'reported' ? 'bg-red-500/10 text-red-100' : 'bg-ink-900 text-slate-300')}><span className="mr-2 text-xs text-slate-500">{m.from}</span>{m.text}</li>)}</ul></div>
            )}
            {detail.data.report.status === 'OPEN' && canAct && (
              <>
                <Field label="Internal note" htmlFor="rn"><Textarea id="rn" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Field>
                <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={() => resolve('DISMISS')}>Dismiss</Button><Button variant="secondary" onClick={() => resolve('WARN')}>Warn user</Button><Button variant="danger" onClick={() => resolve('SUSPEND')}>Suspend user</Button></div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export function AdminUniversities() {
  const { me } = useAuth();
  const toast = useToast();
  const q = useAsync(() => api('/admin/universities'), []);
  const [form, setForm] = useState(null);
  const save = async () => {
    try {
      await api('/admin/universities', { method: 'POST', body: { ...form, departments: form.departments.split(',').map((s) => s.trim()).filter(Boolean) } });
      toast.success('University added.'); setForm(null); q.reload();
    } catch (e) { toast.error(e.message); }
  };
  const toggle = async (u) => { try { await api(`/admin/universities/${u.id}`, { method: 'PUT', body: { active: !u.active } }); q.reload(); } catch (e) { toast.error(e.message); } };
  return (
    <div className="space-y-4">
      {me.role === 'SUPER_ADMIN' && <Button onClick={() => setForm({ name: '', shortName: '', emailDomain: '', departments: '' })}>Add university</Button>}
      <Load q={q}>{(d) => (
        <div className="grid gap-3 md:grid-cols-2">{d.universities.map((u) => (
          <Card key={u.id} className="flex items-start justify-between gap-3"><div><p className="font-medium text-white">{u.name}</p><p className="text-xs text-slate-400">{u.shortName} · @{u.emailDomain} · {u.verificationMethod}</p><p className="mt-1 text-xs text-slate-500">{(u.departments || []).join(', ')}</p></div>
            <div className="text-right"><Badge tone={u.active ? 'good' : 'neutral'}>{u.active ? 'Active' : 'Inactive'}</Badge>{me.role === 'SUPER_ADMIN' && <button className="mt-2 block text-xs text-brand-300 hover:underline" onClick={() => toggle(u)}>{u.active ? 'Deactivate' : 'Activate'}</button>}</div></Card>
        ))}</div>
      )}</Load>
      <Modal open={!!form} onClose={() => setForm(null)} title="Add university">
        {form && <div className="space-y-4">
          <Field label="Name" htmlFor="un"><Input id="un" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Short name" htmlFor="us"><Input id="us" maxLength={12} value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} /></Field>
          <Field label="Email domain" htmlFor="ud" hint="e.g. diu.edu.bd (subdomains are accepted)"><Input id="ud" value={form.emailDomain} onChange={(e) => setForm({ ...form, emailDomain: e.target.value })} /></Field>
          <Field label="Departments (comma separated)" htmlFor="udp"><Input id="udp" value={form.departments} onChange={(e) => setForm({ ...form, departments: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button onClick={save} disabled={!form.name || !form.shortName || !form.emailDomain}>Add</Button></div>
        </div>}
      </Modal>
    </div>
  );
}

const WEIGHT_LABELS = { personality: 'Personality', interests: 'Interests', lifestyle: 'Lifestyle', communication: 'Communication', goals: 'Goals', preferences: 'Connection preferences' };

export function AdminModeration() {
  const { me } = useAuth();
  const toast = useToast();
  const flagged = useAsync(() => api('/admin/moderation/flagged'), []);
  const isSuper = me.role === 'SUPER_ADMIN';
  const weights = useAsync(() => (isSuper ? api('/admin/config/matching') : Promise.resolve(null)), [isSuper]);
  const logs = useAsync(() => (isSuper ? api('/admin/logs') : Promise.resolve(null)), [isSuper]);
  const [w, setW] = useState(null);
  const cur = w || weights.data?.weights;
  const total = cur ? Object.values(cur).reduce((a, b) => a + Number(b), 0) : 0;
  const saveW = async () => { try { await api('/admin/config/matching', { method: 'PUT', body: { weights: Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, Number(v)])) } }); toast.success('Weights saved (normalized to 100%).'); setW(null); weights.reload(); } catch (e) { toast.error(e.message); } };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 font-semibold text-white">Flagged accounts</h2>
        <Load q={flagged}>{(d) => d.flagged.length === 0 ? <EmptyState title="Nothing flagged">Accounts appear here with 2+ open reports or any threat report.</EmptyState> : (
          <div className="space-y-2">{d.flagged.map((f) => <Card key={f.uid} className="flex items-center justify-between"><span className="text-sm text-white">{f.alias}</span><span className="flex gap-2"><Badge tone="bad">{f.openReports} open</Badge>{f.categories.map((c) => <Badge key={c}>{catLabel(c)}</Badge>)}</span></Card>)}</div>
        )}</Load>
      </section>
      {isSuper && (
        <>
          <section>
            <h2 className="mb-1 font-semibold text-white">Matching weights</h2>
            <p className="mb-3 text-xs text-slate-500">Relative weights; they're normalized to 100%. Currently {Math.round(total * 100) / 100} total.</p>
            <Load q={weights}>{() => cur && (
              <Card className="space-y-3">
                {Object.keys(WEIGHT_LABELS).map((k) => (
                  <div key={k} className="flex items-center gap-3"><label className="w-44 text-sm text-slate-300" htmlFor={`w-${k}`}>{WEIGHT_LABELS[k]}</label><input id={`w-${k}`} type="range" min={0} max={1} step={0.05} value={cur[k]} onChange={(e) => setW({ ...cur, [k]: Number(e.target.value) })} /><span className="w-12 text-right text-sm text-slate-300">{total ? Math.round((cur[k] / total) * 100) : 0}%</span></div>
                ))}
                <Button onClick={saveW} disabled={!w || total <= 0}>Save weights</Button>
              </Card>
            )}</Load>
          </section>
          <section>
            <h2 className="mb-3 font-semibold text-white">Audit log</h2>
            <Load q={logs}>{(d) => d && (
              <div className="overflow-x-auto rounded-2xl border border-line"><table className="w-full text-left text-xs"><thead className="bg-ink-800 text-slate-400"><tr>{['When', 'Role', 'Action', 'Target'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-line text-slate-300">{d.logs.map((l) => <tr key={l.id}><td className="px-3 py-2 whitespace-nowrap">{when(l.createdAt)}</td><td className="px-3 py-2">{l.actorRole}</td><td className="px-3 py-2">{l.action}</td><td className="px-3 py-2 font-mono">{String(l.target ?? '').slice(0, 24)}</td></tr>)}</tbody></table></div>
            )}</Load>
          </section>
        </>
      )}
    </div>
  );
}

const chartProps = { stroke: '#2b3b5c' };
const tick = { fill: '#94a3b8', fontSize: 11 };
const tip = { contentStyle: { background: '#101a30', border: '1px solid #22324f', borderRadius: 12, color: '#e6ebf5' } };

export function AdminAnalytics() {
  const q = useAsync(() => api('/admin/analytics'), []);
  return (
    <Load q={q}>{(d) => (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h3 className="mb-3 text-sm font-medium text-white">New accounts (30 days)</h3><div className="h-56"><ResponsiveContainer><LineChart data={d.signups}><CartesianGrid {...chartProps} strokeDasharray="3 3" /><XAxis dataKey="date" tick={tick} tickFormatter={(v) => v.slice(5)} interval={4} /><YAxis tick={tick} allowDecimals={false} width={28} /><Tooltip {...tip} /><Line type="monotone" dataKey="value" name="Sign-ups" stroke="#7f9bff" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></Card>
        <Card><h3 className="mb-3 text-sm font-medium text-white">New matches (30 days)</h3><div className="h-56"><ResponsiveContainer><LineChart data={d.matches}><CartesianGrid {...chartProps} strokeDasharray="3 3" /><XAxis dataKey="date" tick={tick} tickFormatter={(v) => v.slice(5)} interval={4} /><YAxis tick={tick} allowDecimals={false} width={28} /><Tooltip {...tip} /><Line type="monotone" dataKey="value" name="Matches" stroke="#a78bfa" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></Card>
        <Card><h3 className="mb-3 text-sm font-medium text-white">Users by university</h3><div className="h-56"><ResponsiveContainer><BarChart data={d.usersByUniversity}><CartesianGrid {...chartProps} strokeDasharray="3 3" /><XAxis dataKey="name" tick={tick} /><YAxis tick={tick} allowDecimals={false} width={28} /><Tooltip {...tip} /><Bar dataKey="value" name="Users" fill="#7f9bff" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
        <Card><h3 className="mb-3 text-sm font-medium text-white">Reports by category</h3><div className="h-56"><ResponsiveContainer><BarChart data={d.reportsByCategory.map((r) => ({ ...r, name: catLabel(r.category) }))}><CartesianGrid {...chartProps} strokeDasharray="3 3" /><XAxis dataKey="name" tick={tick} interval={0} angle={-25} textAnchor="end" height={60} /><YAxis tick={tick} allowDecimals={false} width={28} /><Tooltip {...tip} /><Bar dataKey="value" name="Reports" fill="#a78bfa" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
      </div>
    )}</Load>
  );
}
