import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Eye, KeyRound, Lock, Mail, MailCheck, ShieldCheck, Users } from 'lucide-react';
import { ApiError, authMessage, publicApi, useAuth } from '../firebase/auth.jsx';
import { Button, Card, Chip, Field, Input, Logo, Modal, ScoreRing, Select, Skeleton, VerifiedBadge, useAsync, useToast } from '../components/index.jsx';
import { GENDERS, GOALS } from '../lib/constants.js';

const Shell = ({ children, wide }) => (
  <div className="relative min-h-screen overflow-hidden">
    <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[60rem] -translate-x-1/2 rounded-full bg-brand-600/10 blur-3xl" aria-hidden />
    <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
      <Link to="/"><Logo /></Link>
      <nav className="flex items-center gap-2"><Button as={Link} to="/login" variant="ghost" size="sm">Sign in</Button><Button as={Link} to="/register" size="sm">Join</Button></nav>
    </header>
    <main className={`relative mx-auto px-5 pb-16 ${wide ? 'max-w-6xl' : 'max-w-md'}`}>{children}</main>
  </div>
);

// ------------------------------------------------------------------ landing
const PILLARS = [
  { icon: ShieldCheck, title: 'Verified students only', body: 'Sign-up needs your university email. One student ID, one account, checked without ever storing the ID itself.' },
  { icon: Lock, title: 'Private by default', body: 'Your student identity is never shown. You choose, field by field, who can see what.' },
  { icon: Users, title: 'Compatibility, not popularity', body: 'A transparent score built from mindset, interests, lifestyle, communication and goals.' },
  { icon: Eye, title: 'Mutual connection', body: 'Chat opens only when you both say "Interested". No cold messages, ever.' },
];

export function Landing() {
  return (
    <Shell wide>
      <section className="mx-auto max-w-3xl pb-14 pt-12 text-center sm:pt-20">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3 py-1 text-xs text-slate-300"><ShieldCheck size={14} className="text-emerald-300" /> Verified university students</span>
          <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-white sm:text-6xl">Meet people who <span className="brand-text">actually get</span> your mindset.</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-slate-400">Friends, study partners, gaming teammates, and more, matched by how you think, not how you look.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button as={Link} to="/register" size="lg">Create your profile <ArrowRight size={18} /></Button>
            <Button as={Link} to="/login" size="lg" variant="secondary">I have an account</Button>
          </div>
        </motion.div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PILLARS.map(({ icon: Icon, title, body }) => (
          <Card key={title} glass>
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-brand-500/15 text-brand-300"><Icon size={20} /></div>
            <h3 className="font-semibold text-white">{title}</h3>
            <p className="mt-1.5 text-sm text-slate-400">{body}</p>
          </Card>
        ))}
      </section>

      <section className="mt-20 grid items-center gap-10 md:grid-cols-2">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-white">Quality over endless swiping</h2>
          <p className="mt-3 text-slate-400">Every day you get a small, curated set of people with a clear breakdown of why you might connect, written cautiously, never promising certainty.</p>
          <ol className="mt-6 space-y-3 text-sm text-slate-300">
            {['Verify with your university email', 'Build your mindset profile (about 5 minutes)', 'Review a few curated recommendations', 'Say "Interested". Chat unlocks only on a mutual match'].map((s, i) => (
              <li key={s} className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-full bg-brand-500/20 text-xs font-semibold text-brand-300">{i + 1}</span>{s}</li>
            ))}
          </ol>
        </div>
        <Card glass className="mx-auto w-full max-w-sm">
          <p className="mb-3 text-[11px] uppercase tracking-wider text-slate-500">Illustrative example</p>
          <div className="flex items-center gap-4">
            <ScoreRing value={89} />
            <div><p className="font-semibold text-white">Profile A7F2</p><p className="text-sm text-slate-400">CSE · 3rd Year</p><VerifiedBadge university="Your university" /></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2"><Chip>🎮 Gaming</Chip><Chip>💻 Programming</Chip><Chip>📚 Technology</Chip></div>
          <p className="mt-4 text-sm text-slate-400">You may have good compatibility because you both enjoy programming and prefer smaller social circles.</p>
        </Card>
      </section>

      <section className="mt-20 text-center">
        <h2 className="text-2xl font-semibold text-white">Not just dating</h2>
        <div className="mt-5 flex flex-wrap justify-center gap-2">{GOALS.filter((g) => g.id !== 'NOT_SURE').map((g) => <Chip key={g.id}>{g.emoji} {g.label}</Chip>)}</div>
      </section>

      <footer className="mt-20 flex flex-wrap justify-between gap-4 border-t border-line pt-6 text-sm text-slate-500">
        <span>© {new Date().getFullYear()} MindMesh</span>
        <span className="flex gap-4"><Link to="/privacy" className="hover:text-slate-300">Privacy</Link><Link to="/terms" className="hover:text-slate-300">Terms</Link></span>
      </footer>
    </Shell>
  );
}

// ------------------------------------------------------------------ login
export function Login() {
  const { login, resetPassword } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [forgot, setForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await login(form.email, form.password);
      nav(loc.state?.from || '/dashboard', { replace: true });
    } catch (err) { setError(authMessage(err)); } finally { setBusy(false); }
  };
  const sendReset = async () => {
    try { await resetPassword(resetEmail); } catch { /* never reveal whether the email exists */ }
    setForgot(false);
    toast.success('If that account exists, a reset link is on its way.');
  };

  return (
    <Shell>
      <Card glass className="mt-8">
        <h1 className="text-2xl font-semibold text-white">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-400">Sign in with your university email.</p>
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <Field label="University email" htmlFor="email"><Input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Password" htmlFor="password"><Input id="password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
          <Button type="submit" loading={busy} className="w-full" disabled={!form.email || !form.password}>Sign in</Button>
        </form>
        <div className="mt-4 flex justify-between text-sm">
          <button className="text-brand-300 hover:underline" onClick={() => { setResetEmail(form.email); setForgot(true); }}>Forgot password?</button>
          <Link to="/register" className="text-slate-400 hover:text-slate-200">Create account</Link>
        </div>
      </Card>
      <Modal open={forgot} onClose={() => setForgot(false)} title="Reset your password">
        <Field label="University email" htmlFor="reset"><Input id="reset" type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} /></Field>
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setForgot(false)}>Cancel</Button><Button onClick={sendReset} disabled={!resetEmail}>Send link</Button></div>
      </Modal>
    </Shell>
  );
}

// ------------------------------------------------------------------ register
export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const unis = useAsync(() => publicApi('/universities'), []);
  const [f, setF] = useState({ universityId: '', studentId: '', email: '', password: '', confirm: '', age: '', gender: '', connectionTypes: [], ageConfirmed: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const uni = unis.data?.universities.find((u) => u.id === f.universityId);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleGoal = (id) => setF({ ...f, connectionTypes: f.connectionTypes.includes(id) ? f.connectionTypes.filter((x) => x !== id) : [...f.connectionTypes, id] });

  const problems = [];
  if (f.email && uni && !f.email.toLowerCase().endsWith(`@${uni.emailDomain}`) && !f.email.toLowerCase().endsWith(`.${uni.emailDomain}`)) problems.push(`Use your @${uni.emailDomain} address`);
  if (f.password && f.password.length < 8) problems.push('Password needs 8+ characters');
  if (f.confirm && f.confirm !== f.password) problems.push('Passwords do not match');
  const ready = f.universityId && f.studentId.trim().length >= 3 && f.email && f.password.length >= 8 && f.confirm === f.password && Number(f.age) >= 18 && f.gender && f.connectionTypes.length && f.ageConfirmed && !problems.length;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await register({ universityId: f.universityId, studentId: f.studentId, email: f.email, password: f.password, ageConfirmed: true, age: Number(f.age), gender: f.gender, connectionTypes: f.connectionTypes });
      nav('/verify', { replace: true });
    } catch (err) { setError(err instanceof ApiError ? err.message : authMessage(err)); } finally { setBusy(false); }
  };

  return (
    <Shell>
      <Card glass className="mt-4">
        <h1 className="text-2xl font-semibold text-white">Join MindMesh</h1>
        <p className="mt-1 text-sm text-slate-400">Verified students only. Your student ID is hashed and never shown to anyone.</p>
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <Field label="University" htmlFor="uni">
            {unis.loading ? <Skeleton className="h-10" /> : (
              <Select id="uni" value={f.universityId} onChange={set('universityId')} required>
                <option value="">Select your university</option>
                {unis.data?.universities.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Student ID" htmlFor="sid" hint="Used only to make sure one student has one account. We store a one-way hash, not the ID."><Input id="sid" autoComplete="off" value={f.studentId} onChange={set('studentId')} /></Field>
          <Field label="University email" htmlFor="em" hint={uni ? `Must end with @${uni.emailDomain}` : 'Pick your university first'}><Input id="em" type="email" autoComplete="email" value={f.email} onChange={set('email')} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Password" htmlFor="pw"><Input id="pw" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
            <Field label="Confirm password" htmlFor="pw2"><Input id="pw2" type="password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Age" htmlFor="age"><Input id="age" type="number" min={18} max={80} value={f.age} onChange={set('age')} /></Field>
            <Field label="Gender" htmlFor="gender">
              <Select id="gender" value={f.gender} onChange={set('gender')}><option value="">Select</option>{GENDERS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</Select>
            </Field>
          </div>
          <Field label="What are you here for?" hint="Choose one or more. You can change this later.">
            <div className="flex flex-wrap gap-2">{GOALS.map((g) => <Chip key={g.id} active={f.connectionTypes.includes(g.id)} onClick={() => toggleGoal(g.id)}>{g.emoji} {g.label}</Chip>)}</div>
          </Field>
          <label className="flex items-start gap-3 text-sm text-slate-300">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-500" checked={f.ageConfirmed} onChange={(e) => setF({ ...f, ageConfirmed: e.target.checked })} />
            <span>I confirm I am 18 or older and agree to the <Link to="/terms" className="text-brand-300 underline">Terms</Link> and <Link to="/privacy" className="text-brand-300 underline">Privacy Policy</Link>.</span>
          </label>
          {problems.map((p) => <p key={p} className="text-sm text-amber-300">{p}</p>)}
          {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
          <Button type="submit" loading={busy} disabled={!ready} className="w-full">Create account</Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-400">Already registered? <Link to="/login" className="text-brand-300 hover:underline">Sign in</Link></p>
      </Card>
    </Shell>
  );
}

// ------------------------------------------------------------------ verify
export function Verify() {
  const { me, fbUser, checkVerification, resendVerification, logout } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [cool, setCool] = useState(0);
  const done = useRef(false);

  const check = async (silent) => {
    if (done.current) return;
    if (!silent) setBusy(true);
    try {
      if (await checkVerification()) {
        done.current = true;
        toast.success('Verified. Welcome aboard!');
        nav('/onboarding', { replace: true });
      } else if (!silent) toast.info("We haven't seen the verification yet. Click the link in your email first.");
    } catch (e) { if (!silent) toast.error(e.message); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (me?.emailVerified && me?.profile?.verified) { nav('/onboarding', { replace: true }); return undefined; }
    const t = setInterval(() => check(true), 6000);
    const onFocus = () => check(true);
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (cool <= 0) return undefined; const t = setTimeout(() => setCool(cool - 1), 1000); return () => clearTimeout(t); }, [cool]);

  const resend = async () => {
    try { await resendVerification(); setCool(45); toast.success('Verification email sent.'); } catch (e) { toast.error(authMessage(e)); }
  };

  return (
    <Shell>
      <Card glass className="mt-10 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/15 text-brand-300"><MailCheck size={28} /></div>
        <h1 className="text-2xl font-semibold text-white">Verify your university email</h1>
        <p className="mt-2 text-sm text-slate-400">We sent a link to <span className="text-slate-200">{me?.email || fbUser?.email}</span>. Open it, then come back. This page updates by itself.</p>
        <div className="mt-6 space-y-3">
          <Button className="w-full" loading={busy} onClick={() => check(false)}>I've verified</Button>
          <Button variant="secondary" className="w-full" disabled={cool > 0} onClick={resend}>{cool > 0 ? `Resend in ${cool}s` : 'Resend email'}</Button>
          <button className="text-sm text-slate-400 hover:text-slate-200" onClick={logout}>Use a different account</button>
        </div>
        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500"><KeyRound size={14} /> Check spam if you don't see it within a minute.</p>
      </Card>
    </Shell>
  );
}

// ------------------------------------------------------------------ legal
const Legal = ({ title, updated, children }) => (
  <Shell wide>
    <article className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-semibold text-white">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">Last updated {updated}. Template text: have counsel review it before launch.</p>
      <div className="mt-8 space-y-6 text-slate-300 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_p]:leading-relaxed">{children}</div>
    </article>
  </Shell>
);

export const PrivacyPolicy = () => (
  <Legal title="Privacy Policy" updated="October 2026">
    <section><h2>What we collect</h2><ul><li>Account data: university, university email, age, gender, and a one-way hash of your student ID (never the ID itself).</li><li>Profile data you choose to add: name, photo, department, year, bio, interests, personality sliders, lifestyle and communication answers, goals and preferences.</li><li>Messages you send to your mutual matches, and basic safety records such as blocks and reports.</li></ul></section>
    <section><h2>What other people can see</h2><p>Nothing about your student ID, email, phone or exact location is ever shown. Everything else follows the visibility you set in the Privacy Center: Everyone, Compatible matches, Mutual matches only, or Nobody. Before a mutual match you may appear as an anonymous alias.</p></section>
    <section><h2>How matching and AI work</h2><p>Compatibility scores are calculated by a deterministic algorithm from information you provided. An AI service may be used only to word short explanations and conversation starters. It receives category percentages and shared interests, never your identity, contact details, bio or messages. It is not used to judge people, and compatibility is a fun guide, not a scientific measure.</p></section>
    <section><h2>Moderation</h2><p>Staff cannot browse private conversations. If you report someone you can choose to attach the last few messages of that conversation as evidence. Sensitive lookups by admins are limited to senior roles and written to an audit log.</p></section>
    <section><h2>Your controls and deletion</h2><p>You can hide your profile, block, unmatch, and delete your account at any time from Settings → Privacy. Deletion removes your profile, matches, conversations, likes, passes, blocks, notifications and photos. Report records involving you are kept for safety, and if an account was suspended its one-way ID hash is kept so the ban cannot be bypassed.</p></section>
  </Legal>
);

export const Terms = () => (
  <Legal title="Terms of Service" updated="October 2026">
    <section><h2>Eligibility</h2><p>You must be 18 or older and a current student of a supported university, with one account per student.</p></section>
    <section><h2>Be decent</h2><p>No harassment, threats, scams, spam, fake profiles or inappropriate content. We may suspend accounts that break these rules.</p></section>
    <section><h2>Compatibility features</h2><p>Scores, explanations, icebreakers and the Compatibility Lab are for fun and conversation. They are not psychological, medical or scientific assessments and make no promises about any relationship.</p></section>
    <section><h2>Safety</h2><p>Be careful when meeting people in person: choose public places and tell someone you trust. Use Block and Report whenever something feels wrong.</p></section>
    <section><h2>No warranty</h2><p>The service is provided as is. We are not responsible for the conduct of users.</p></section>
  </Legal>
);

export function NotFound() {
  return (
    <Shell>
      <Card glass className="mt-16 text-center">
        <h1 className="text-5xl font-semibold text-white">404</h1>
        <p className="mt-2 text-slate-400">That page doesn't exist.</p>
        <Button as={Link} to="/" className="mt-6">Go home</Button>
      </Card>
    </Shell>
  );
}

export function ConfigMissing() {
  return (
    <Shell>
      <Card glass className="mt-16">
        <Mail className="mb-3 text-brand-300" />
        <h1 className="text-xl font-semibold text-white">Firebase isn't configured</h1>
        <p className="mt-2 text-sm text-slate-400">Copy <code className="rounded bg-ink-700 px-1.5">.env.example</code> to <code className="rounded bg-ink-700 px-1.5">client/.env</code>, fill in the <code className="rounded bg-ink-700 px-1.5">VITE_FIREBASE_*</code> values from your Firebase web app, then restart <code className="rounded bg-ink-700 px-1.5">npm run dev</code>.</p>
      </Card>
    </Shell>
  );
}
