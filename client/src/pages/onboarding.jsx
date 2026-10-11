import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ArrowLeft, ArrowRight, Camera, Plus } from 'lucide-react';
import { api, storage, useAuth } from '../firebase/auth.jsx';
import { Avatar, Button, Card, Chip, Field, Input, Logo, ProgressBar, Select, Slider, Textarea, Toggle, useToast } from '../components/index.jsx';
import { GENDERS, GOALS, INTERESTS, TRAITS, interestEmoji } from '../lib/constants.js';

// ------------------------------------------------------------------ draft handling
export function makeDraft(p = {}) {
  return {
    displayName: p.displayName ?? '',
    photoURL: p.photoURL ?? null,
    department: p.department ?? '',
    academicYear: p.academicYear ?? 1,
    age: p.age ?? 20,
    gender: p.gender ?? 'PREFER_NOT_TO_SAY',
    bio: p.bio ?? '',
    personality: { introExtro: 50, logicEmo: 50, plannerSpont: 50, seriousPlayful: 50, quietSocial: 50, indepCollab: 50, riskTaking: 50, ...(p.personality || {}) },
    interests: p.interests ?? [],
    lifestyle: { sleep: 'NORMAL', studyHabit: 'MIXED', socialActivity: 50, weekend: 'MIXED', indoorOutdoor: 50, workStudyBalance: 50, smokes: false, drinks: false, ...(p.lifestyle || {}) },
    communication: { frequency: 'MEDIUM', depth: 'MIXED', medium: 'TEXT', groupVsOne: 'BOTH', ...(p.communication || {}) },
    goals: p.goals ?? [],
    preferences: { ageMin: 18, ageMax: 30, genders: [], university: 'ANY', department: 'ANY', ...(p.preferences || {}) },
    dealBreakers: { smoking: false, alcohol: false, verySocial: false, differentCommFrequency: false, ...(p.dealBreakers || {}) },
  };
}

const OptionCards = ({ value, onChange, options, cols = 3 }) => (
  <div className={`grid gap-2 ${cols === 4 ? 'grid-cols-2 sm:grid-cols-4' : cols === 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`} role="radiogroup">
    {options.map(([id, label, desc]) => (
      <button key={id} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)}
        className={`rounded-xl border p-3 text-left text-sm transition ${value === id ? 'border-brand-400 bg-brand-500/15 text-white' : 'border-line bg-white/[0.02] text-slate-300 hover:bg-white/5'}`}>
        <span className="block font-medium">{label}</span>{desc && <span className="block text-xs text-slate-400">{desc}</span>}
      </button>
    ))}
  </div>
);

async function resizeToBlob(file, max = 640) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not process image'))), 'image/jpeg', 0.85));
}

// ------------------------------------------------------------------ sections (each: { value: draft, set: (patch) => void })
function Basics({ value: d, set, university }) {
  const { uid } = useAuth();
  const toast = useToast();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const depts = university?.departments || [];

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image.');
    setUploading(true);
    try {
      const blob = await resizeToBlob(file);
      const r = ref(storage, `avatars/${uid}/${Date.now()}.jpg`);
      await uploadBytes(r, blob, { contentType: 'image/jpeg' });
      set({ photoURL: await getDownloadURL(r) });
    } catch { toast.error('Upload failed. Try a smaller image.'); } finally { setUploading(false); e.target.value = ''; }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar src={d.photoURL} name={d.displayName || '?'} size={72} />
        <div>
          <Button type="button" variant="secondary" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}><Camera size={16} /> {d.photoURL ? 'Change photo' : 'Add photo'}</Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
          <p className="mt-1.5 text-xs text-slate-400">Optional. Only shown to people your privacy settings allow.</p>
        </div>
      </div>
      <Field label="Display name" htmlFor="dn" hint="Shown to mutual matches by default."><Input id="dn" maxLength={40} value={d.displayName} onChange={(e) => set({ displayName: e.target.value })} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Department" htmlFor="dept">
          <Input id="dept" list="dept-list" maxLength={60} value={d.department} onChange={(e) => set({ department: e.target.value })} placeholder="e.g. CSE" />
          <datalist id="dept-list">{depts.map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
        <Field label="Academic year" htmlFor="yr"><Select id="yr" value={d.academicYear} onChange={(e) => set({ academicYear: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>Year {y}</option>)}</Select></Field>
        <Field label="Age" htmlFor="age"><Input id="age" type="number" min={18} max={80} value={d.age} onChange={(e) => set({ age: Math.max(18, Math.min(80, Number(e.target.value) || 18)) })} /></Field>
        <Field label="Gender" htmlFor="gen"><Select id="gen" value={d.gender} onChange={(e) => set({ gender: e.target.value })}>{GENDERS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</Select></Field>
      </div>
      <Field label="Short bio" htmlFor="bio" hint={`${d.bio.length}/300. A sentence or two about you. No contact details please.`}>
        <Textarea id="bio" maxLength={300} value={d.bio} onChange={(e) => set({ bio: e.target.value })} />
      </Field>
    </div>
  );
}

function Personality({ value: d, set }) {
  return (
    <div className="space-y-6">
      {TRAITS.map((t) => <Slider key={t.id} left={t.left} right={t.right} value={d.personality[t.id]} onChange={(v) => set({ personality: { ...d.personality, [t.id]: v } })} />)}
      <p className="text-xs text-slate-500">There are no right answers. These sliders only help find people whose style fits yours.</p>
    </div>
  );
}

function Interests({ value: d, set }) {
  const [custom, setCustom] = useState('');
  const has = (n) => d.interests.some((i) => i.toLowerCase() === n.toLowerCase());
  const toggle = (n) => set({ interests: has(n) ? d.interests.filter((i) => i.toLowerCase() !== n.toLowerCase()) : [...d.interests, n].slice(0, 15) });
  const addCustom = () => { const v = custom.trim().slice(0, 30); if (v && !has(v)) toggle(v); setCustom(''); };
  const extras = d.interests.filter((i) => !INTERESTS.some(([n]) => n.toLowerCase() === i.toLowerCase()));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[...INTERESTS.map(([n]) => n), ...extras].map((n) => <Chip key={n} active={has(n)} onClick={() => toggle(n)}>{interestEmoji(n)} {n}</Chip>)}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Add your own…" maxLength={30} value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())} aria-label="Custom interest" />
        <Button type="button" variant="secondary" onClick={addCustom} aria-label="Add interest"><Plus size={16} /></Button>
      </div>
      <p className={`text-xs ${d.interests.length >= 3 ? 'text-slate-500' : 'text-amber-300'}`}>{d.interests.length}/15 selected. Pick at least 3.</p>
    </div>
  );
}

function Lifestyle({ value: d, set }) {
  const l = d.lifestyle;
  const up = (patch) => set({ lifestyle: { ...l, ...patch } });
  return (
    <div className="space-y-6">
      <Field label="Sleep schedule"><OptionCards value={l.sleep} onChange={(v) => up({ sleep: v })} options={[['EARLY', 'Early bird', 'Up with the sun'], ['NORMAL', 'In between'], ['NIGHT_OWL', 'Night owl', 'Best after dark']]} /></Field>
      <Field label="Study habits"><OptionCards value={l.studyHabit} onChange={(v) => up({ studyHabit: v })} options={[['SOLO', 'Solo'], ['MIXED', 'Mix of both'], ['GROUP', 'With others']]} /></Field>
      <Field label="Weekends"><OptionCards value={l.weekend} onChange={(v) => up({ weekend: v })} options={[['HOME', 'Mostly home'], ['MIXED', 'A bit of both'], ['OUTDOOR', 'Out and about']]} /></Field>
      <Slider left="Quiet social life" right="Very social" value={l.socialActivity} onChange={(v) => up({ socialActivity: v })} />
      <Slider left="Indoors" right="Outdoors" value={l.indoorOutdoor} onChange={(v) => up({ indoorOutdoor: v })} />
      <Slider left="All work and study" right="All play" value={l.workStudyBalance} onChange={(v) => up({ workStudyBalance: v })} />
      <div className="rounded-xl border border-line p-4">
        <p className="mb-3 text-sm font-medium text-slate-200">Optional habits <span className="font-normal text-slate-500">(only used for deal-breakers you set, never shown on your profile)</span></p>
        <div className="space-y-3 text-sm text-slate-300">
          <div className="flex items-center justify-between">I smoke <Toggle label="I smoke" checked={l.smokes} onChange={(v) => up({ smokes: v })} /></div>
          <div className="flex items-center justify-between">I drink alcohol <Toggle label="I drink alcohol" checked={l.drinks} onChange={(v) => up({ drinks: v })} /></div>
        </div>
      </div>
    </div>
  );
}

function Communication({ value: d, set }) {
  const c = d.communication;
  const up = (patch) => set({ communication: { ...c, ...patch } });
  return (
    <div className="space-y-6">
      <Field label="How often do you like to chat?"><OptionCards value={c.frequency} onChange={(v) => up({ frequency: v })} options={[['LOW', 'Now and then'], ['MEDIUM', 'Regularly'], ['HIGH', 'Most days']]} /></Field>
      <Field label="Conversation depth"><OptionCards value={c.depth} onChange={(v) => up({ depth: v })} options={[['LIGHT', 'Light and fun'], ['MIXED', 'Depends on the day'], ['DEEP', 'Deep and thoughtful']]} /></Field>
      <Field label="Preferred way to talk"><OptionCards cols={4} value={c.medium} onChange={(v) => up({ medium: v })} options={[['TEXT', 'Text'], ['VOICE', 'Voice'], ['IN_PERSON', 'In person'], ['MIXED', 'Mix']]} /></Field>
      <Field label="Group or one-on-one?"><OptionCards value={c.groupVsOne} onChange={(v) => up({ groupVsOne: v })} options={[['ONE_ON_ONE', 'One-on-one'], ['BOTH', 'Both'], ['GROUP', 'Groups']]} /></Field>
    </div>
  );
}

function GoalsPrefs({ value: d, set }) {
  const p = d.preferences, db_ = d.dealBreakers;
  const upP = (patch) => set({ preferences: { ...p, ...patch } });
  const upD = (patch) => set({ dealBreakers: { ...db_, ...patch } });
  const toggleGoal = (id) => set({ goals: d.goals.includes(id) ? d.goals.filter((g) => g !== id) : [...d.goals, id] });
  const toggleGender = (id) => upP({ genders: p.genders.includes(id) ? p.genders.filter((g) => g !== id) : [...p.genders, id] });
  return (
    <div className="space-y-7">
      <Field label="What are you looking for?" hint="Choose all that apply. You'll only be recommended people with an overlapping goal.">
        <div className="flex flex-wrap gap-2">{GOALS.map((g) => <Chip key={g.id} active={d.goals.includes(g.id)} onClick={() => toggleGoal(g.id)}>{g.emoji} {g.label}</Chip>)}</div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Preferred age: from" htmlFor="amin"><Input id="amin" type="number" min={18} max={80} value={p.ageMin} onChange={(e) => { const v = Math.max(18, Number(e.target.value) || 18); upP({ ageMin: v, ageMax: Math.max(v, p.ageMax) }); }} /></Field>
        <Field label="to" htmlFor="amax"><Input id="amax" type="number" min={18} max={80} value={p.ageMax} onChange={(e) => { const v = Math.min(80, Number(e.target.value) || 80); upP({ ageMax: v, ageMin: Math.min(v, p.ageMin) }); }} /></Field>
      </div>
      <Field label="Preferred gender(s)" hint="Leave all unselected for no preference. Preferences are respected in both directions.">
        <div className="flex flex-wrap gap-2">{GENDERS.map((g) => <Chip key={g.id} active={p.genders.includes(g.id)} onClick={() => toggleGender(g.id)}>{g.label}</Chip>)}</div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="University" htmlFor="pu"><Select id="pu" value={p.university} onChange={(e) => upP({ university: e.target.value })}><option value="ANY">Any university</option><option value="SAME">Same university</option><option value="OTHER">Other universities</option></Select></Field>
        <Field label="Department" htmlFor="pd"><Select id="pd" value={p.department} onChange={(e) => upP({ department: e.target.value })}><option value="ANY">Any department</option><option value="SAME">Same department</option><option value="DIFFERENT">Different departments</option></Select></Field>
      </div>
      <div className="rounded-xl border border-line p-4">
        <p className="text-sm font-medium text-slate-200">Deal-breakers <span className="font-normal text-slate-500">(optional, your own preferences)</span></p>
        <div className="mt-3 space-y-3 text-sm text-slate-300">
          {[['smoking', 'Don\'t show me people who smoke'], ['alcohol', 'Don\'t show me people who drink'], ['verySocial', 'Not a very social lifestyle'], ['differentCommFrequency', 'Very different communication frequency']].map(([k, label]) => (
            <div key={k} className="flex items-center justify-between gap-3">{label}<Toggle label={label} checked={db_[k]} onChange={(v) => upD({ [k]: v })} /></div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const SECTIONS = [
  { id: 'basics', title: 'About you', subtitle: 'The basics. You control who sees what later.', Component: Basics, keys: ['displayName', 'photoURL', 'department', 'academicYear', 'age', 'gender', 'bio'],
    valid: (d) => (d.displayName.trim().length >= 2 && d.department.trim() && d.bio.trim().length >= 10) || 'Add a name, department and a short bio (10+ characters).' },
  { id: 'personality', title: 'Your personality', subtitle: 'Slide towards whichever feels more like you.', Component: Personality, keys: ['personality'], valid: () => true },
  { id: 'interests', title: 'Your interests', subtitle: 'What do you enjoy?', Component: Interests, keys: ['interests'], valid: (d) => d.interests.length >= 3 || 'Pick at least 3 interests.' },
  { id: 'lifestyle', title: 'Lifestyle', subtitle: 'Day-to-day rhythm. Nothing invasive.', Component: Lifestyle, keys: ['lifestyle'], valid: () => true },
  { id: 'communication', title: 'Communication style', subtitle: 'How you like to connect.', Component: Communication, keys: ['communication'], valid: () => true },
  { id: 'goals', title: 'Goals & preferences', subtitle: 'Who you would like to meet.', Component: GoalsPrefs, keys: ['goals', 'preferences', 'dealBreakers'], valid: (d) => d.goals.length >= 1 || 'Choose at least one goal.' },
];

const pickKeys = (d, keys) => Object.fromEntries(keys.map((k) => [k, d[k]]));
export const payloadFor = (d, keys) => {
  const out = pickKeys(d, keys);
  if ('photoURL' in out && !out.photoURL) delete out.photoURL; // null not sent; photo is optional
  return out;
};

// ------------------------------------------------------------------ wizard
export function Onboarding() {
  const { me, loadMe } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [draft, setDraft] = useState(() => makeDraft(me.profile));
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [saving, setSaving] = useState(false);
  const sec = SECTIONS[step];
  const problem = sec.valid(draft);
  const last = step === SECTIONS.length - 1;

  const next = async () => {
    if (typeof problem === 'string') return toast.error(problem);
    setSaving(true);
    try {
      await api('/profile', { method: 'PUT', body: payloadFor(draft, sec.keys) });
      if (last) {
        await loadMe();
        toast.success("You're all set. Here are your first recommendations.");
        nav('/dashboard', { replace: true });
      } else { setDir(1); setStep(step + 1); window.scrollTo({ top: 0 }); }
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between"><Logo /><span className="text-sm text-slate-400">Step {step + 1} of {SECTIONS.length}</span></div>
      <ProgressBar value={Math.round(((step + 1) / SECTIONS.length) * 100)} className="mb-8" />
      <AnimatePresence mode="wait" custom={dir}>
        <motion.div key={sec.id} initial={{ opacity: 0, x: 24 * dir }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 * dir }} transition={{ duration: 0.2 }}>
          <h1 className="text-2xl font-semibold text-white">{sec.title}</h1>
          <p className="mb-6 mt-1 text-sm text-slate-400">{sec.subtitle}</p>
          <Card glass><sec.Component value={draft} set={(patch) => setDraft((d) => ({ ...d, ...patch }))} university={me.university} /></Card>
        </motion.div>
      </AnimatePresence>
      <div className="mt-6 flex justify-between">
        <Button variant="ghost" disabled={step === 0 || saving} onClick={() => { setDir(-1); setStep(step - 1); }}><ArrowLeft size={16} /> Back</Button>
        <Button loading={saving} onClick={next}>{last ? 'Finish' : 'Continue'} <ArrowRight size={16} /></Button>
      </div>
    </div>
  );
}
