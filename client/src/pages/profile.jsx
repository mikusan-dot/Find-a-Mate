import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { api, useAuth } from '../firebase/auth.jsx';
import { Avatar, Badge, Button, Card, Chip, PageHeader, ProgressBar, VerifiedBadge, useToast } from '../components/index.jsx';
import { SECTIONS, makeDraft, payloadFor } from './onboarding.jsx';
import { TRAITS, goalEmoji, goalLabel, interestEmoji, ordinal } from '../lib/constants.js';

export function Profile() {
  const { me } = useAuth();
  const p = me.profile, c = me.completeness;
  return (
    <div className="space-y-6">
      <PageHeader title="Your profile" action={<Button as={Link} to="/profile/edit" variant="secondary" size="sm"><Pencil size={15} /> Edit</Button>} />
      <Card glass className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar src={p.photoURL} name={p.displayName} size={80} />
          <div>
            <p className="text-xl font-semibold text-white">{p.displayName}</p>
            <p className="text-sm text-slate-400">{[p.department, p.academicYear && `${ordinal(p.academicYear)} Year`, p.age].filter(Boolean).join(' · ')}</p>
            <VerifiedBadge university={me.university?.name} />
          </div>
        </div>
        {p.bio && <p className="text-sm text-slate-300">{p.bio}</p>}
        <div className="flex flex-wrap gap-2">{p.goals?.map((g) => <Badge key={g} tone="brand">{goalEmoji(g)} {goalLabel(g)}</Badge>)}</div>
        <div className="flex flex-wrap gap-2">{p.interests?.map((i) => <Chip key={i}>{interestEmoji(i)} {i}</Chip>)}</div>
      </Card>
      <Card>
        <div className="flex items-center justify-between"><h2 className="font-semibold text-white">Profile completeness</h2><span className="text-sm text-slate-300">{c.percent}%</span></div>
        <ProgressBar value={c.percent} className="mt-3" />
        {c.missing.length > 0 && <><p className="mt-3 text-sm text-slate-400">Missing:</p><ul className="mt-1 list-inside list-disc text-sm text-slate-300">{c.missing.map((m) => <li key={m}>{m}</li>)}</ul><Button as={Link} to="/profile/edit" className="mt-4" size="sm">Complete Profile</Button></>}
      </Card>
      <Card>
        <h2 className="mb-4 font-semibold text-white">Your mindset</h2>
        <div className="space-y-3">
          {TRAITS.map((t) => (
            <div key={t.id}>
              <div className="mb-1 flex justify-between text-xs text-slate-400"><span>{t.left}</span><span>{t.right}</span></div>
              <div className="relative h-1.5 rounded-full bg-ink-600"><span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-400" style={{ left: `${p.personality?.[t.id] ?? 50}%` }} /></div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">Who sees this is controlled in <Link to="/settings/privacy" className="text-brand-300 underline">Privacy Center</Link>. Your student ID and email are never shown.</p>
      </Card>
    </div>
  );
}

export function ProfileEdit() {
  const { me, loadMe } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [draft, setDraft] = useState(() => makeDraft(me.profile));
  const [saving, setSaving] = useState(false);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    for (const s of SECTIONS) { const v = s.valid(draft); if (typeof v === 'string') return toast.error(`${s.title}: ${v}`); }
    setSaving(true);
    try {
      await api('/profile', { method: 'PUT', body: payloadFor(draft, SECTIONS.flatMap((s) => s.keys)) });
      await loadMe();
      toast.success('Profile saved.');
      nav('/profile');
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader title="Edit profile" subtitle="Changes update your recommendations." />
      {SECTIONS.map((s) => (
        <Card key={s.id} glass>
          <h2 className="text-lg font-semibold text-white">{s.title}</h2>
          <p className="mb-5 text-sm text-slate-400">{s.subtitle}</p>
          <s.Component value={draft} set={set} university={me.university} />
        </Card>
      ))}
      <div className="sticky bottom-20 z-10 flex justify-end gap-2 md:bottom-4"><Button variant="secondary" as={Link} to="/profile">Cancel</Button><Button loading={saving} onClick={save}>Save changes</Button></div>
    </div>
  );
}
