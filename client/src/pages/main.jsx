import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Compass, FlaskConical, Heart, MessageCircle, RefreshCw, Sparkles } from 'lucide-react';
import { api, useAuth } from '../firebase/auth.jsx';
import {
  Avatar, Badge, Button, Card, Chip, EmptyState, ErrorState, Modal, PageHeader, ProgressBar, ScoreRing, Skeleton, VerifiedBadge,
  useAsync, useNotifications, usePullToRefresh, useToast,
} from '../components/index.jsx';
import { BREAKDOWN_LABELS, goalEmoji, goalLabel, interestEmoji, ordinal } from '../lib/constants.js';

// ------------------------------------------------------------------ shared cards
export function Breakdown({ breakdown }) {
  return (
    <div className="space-y-2">
      {Object.entries(breakdown).filter(([k]) => k !== 'preferences').map(([k, v]) => (
        <div key={k}>
          <div className="mb-1 flex justify-between text-xs text-slate-400"><span>{BREAKDOWN_LABELS[k]}</span><span>{v}%</span></div>
          <ProgressBar value={v} className="h-1.5" />
        </div>
      ))}
    </div>
  );
}

export function WhyMatch({ rec }) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h4 className="mb-1.5 font-medium text-white">Why you might connect</h4>
        <ul className="space-y-1.5 text-slate-300">{rec.explanation.bullets.map((b) => <li key={b} className="flex gap-2"><Sparkles size={14} className="mt-1 shrink-0 text-brand-300" />{b}</li>)}</ul>
      </div>
      <Breakdown breakdown={rec.breakdown} />
      <p className="text-xs text-slate-500">A friendly guide based on what you both shared, not a promise. {rec.explanation.source === 'ai' ? 'Wording written with AI help.' : ''}</p>
    </div>
  );
}

function ProfileMeta({ rec }) {
  const bits = [rec.department, rec.academicYear ? `${ordinal(rec.academicYear)} Year` : null, rec.age ? `${rec.age}` : null].filter(Boolean);
  return (
    <div className="min-w-0">
      <p className="truncate text-lg font-semibold text-white">{rec.displayName}</p>
      <p className="text-sm text-slate-400">{bits.length ? bits.join(' · ') : 'Details hidden by this person'}</p>
      <VerifiedBadge university={rec.university?.shortName} />
    </div>
  );
}

export function ProfileDetail({ rec }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar src={rec.photoURL} name={rec.displayName} size={72} />
        <div className="flex-1"><ProfileMeta rec={rec} /></div>
        <ScoreRing value={rec.score} />
      </div>
      {rec.bio && <p className="text-sm text-slate-300">{rec.bio}</p>}
      <div className="flex flex-wrap gap-2">{rec.goals.map((g) => <Chip key={g}>{goalEmoji(g)} {goalLabel(g)}</Chip>)}</div>
      {rec.interests.length > 0 && <div className="flex flex-wrap gap-2">{rec.interests.map((i) => <Chip key={i}>{interestEmoji(i)} {i}</Chip>)}</div>}
      <WhyMatch rec={rec} />
      {rec.hidden.length > 0 && <p className="text-xs text-slate-500">Hidden by this person's privacy settings: {rec.hidden.join(', ')}.</p>}
    </div>
  );
}

export function RecommendationCard({ rec, onInterested, onPass, onView, rank }) {
  const [busy, setBusy] = useState(null);
  const act = async (kind, fn) => { setBusy(kind); try { await fn(rec); } finally { setBusy(null); } };
  const [open, setOpen] = useState(false);
  return (
    <motion.div layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}>
      <Card glass className="space-y-4">
        <div className="flex items-start gap-4">
          {rank && <span className="hidden text-sm font-semibold text-slate-500 sm:block">#{rank}</span>}
          <Avatar src={rec.photoURL} name={rec.displayName} size={56} />
          <div className="flex-1"><ProfileMeta rec={rec} /></div>
          <div className="text-center"><ScoreRing value={rec.score} /><p className="mt-1 text-[11px] text-slate-400">Compatible</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {rec.interests.slice(0, 5).map((i) => <Chip key={i}>{interestEmoji(i)} {i}</Chip>)}
          {rec.interests.length === 0 && <Badge>Interests hidden</Badge>}
        </div>
        <div className="flex flex-wrap gap-1.5">{rec.goals.map((g) => <Badge key={g} tone="brand">{goalEmoji(g)} {goalLabel(g)}</Badge>)}</div>

        <button onClick={() => setOpen((o) => !o)} className="text-sm text-brand-300 hover:underline" aria-expanded={open}>{open ? 'Hide' : 'Why this match?'}</button>
        <AnimatePresence initial={false}>
          {open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><WhyMatch rec={rec} /></motion.div>}
        </AnimatePresence>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={() => onView(rec)}>View Profile</Button>
          <Button size="sm" loading={busy === 'like'} disabled={!!busy} onClick={() => act('like', onInterested)}><Heart size={15} /> Interested</Button>
          <Button variant="ghost" size="sm" loading={busy === 'pass'} disabled={!!busy} onClick={() => act('pass', onPass)}>Pass</Button>
        </div>
      </Card>
    </motion.div>
  );
}

const CardSkeletons = ({ n = 3 }) => <div className="space-y-4">{Array.from({ length: n }, (_, i) => <Skeleton key={i} className="h-56" />)}</div>;

// ------------------------------------------------------------------ discovery logic hook
function useDiscovery(limit) {
  const toast = useToast();
  const nav = useNavigate();
  const q = useAsync(() => api(`/discover?limit=${limit}`), [limit]);
  const remove = (uid) => q.setData({ ...q.data, recommendations: q.data.recommendations.filter((r) => r.uid !== uid) });

  const like = async (rec) => {
    try {
      const r = await api(`/discover/${rec.uid}/like`, { method: 'POST' });
      remove(rec.uid);
      if (r.matched) { toast.success("It's a match! You can chat now."); nav(`/chat/${r.matchId}`); } else toast.info('Interest sent. They will only know if they feel the same.');
    } catch (e) { toast.error(e.message); if (e.status === 404) remove(rec.uid); }
  };
  const pass = async (rec) => {
    try { await api(`/discover/${rec.uid}/pass`, { method: 'POST' }); remove(rec.uid); } catch (e) { toast.error(e.message); }
  };
  return { ...q, like, pass };
}

// ------------------------------------------------------------------ dashboard
export function Dashboard() {
  const { me } = useAuth();
  const { newMatches, unreadMessages } = useNotifications();
  const d = useDiscovery(3);
  const [view, setView] = useState(null);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const c = me.completeness;
  const firstName = (me.profile?.displayName || '').split(' ')[0];

  const stats = [
    { label: 'Recommended', value: d.data?.recommendations.length ?? '–', icon: Compass, to: '/discover' },
    { label: 'New matches', value: newMatches, icon: Heart, to: '/matches' },
    { label: 'Unread messages', value: unreadMessages, icon: MessageCircle, to: '/chat' },
  ];

  return (
    <div className="space-y-8">
      <PageHeader title={`${greet}, ${firstName} 👋`} subtitle={`${me.university?.name ?? ''} · Verified Student`} />
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="md:col-span-1">
          <p className="text-sm text-slate-400">Profile completeness</p>
          <p className="mt-1 text-3xl font-semibold text-white">{c.percent}%</p>
          <ProgressBar value={c.percent} className="mt-3" />
          {c.missing.length > 0 && (
            <><p className="mt-3 text-xs text-slate-400">Missing: {c.missing.slice(0, 3).join(', ')}{c.missing.length > 3 ? '…' : ''}</p>
            <Button as={Link} to="/profile/edit" variant="secondary" size="sm" className="mt-3">Complete Profile</Button></>
          )}
        </Card>
        {stats.map(({ label, value, icon: Icon, to }) => (
          <Link key={label} to={to}><Card className="h-full transition hover:bg-ink-700"><Icon size={18} className="text-brand-300" /><p className="mt-3 text-3xl font-semibold text-white">{value}</p><p className="text-sm text-slate-400">{label}</p></Card></Link>
        ))}
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-white">People you may connect with</h2><Link to="/discover" className="text-sm text-brand-300 hover:underline">See all</Link></div>
        {d.loading ? <CardSkeletons n={2} /> : d.error ? <ErrorState error={d.error} onRetry={d.reload} /> : d.data.recommendations.length === 0 ? (
          <EmptyState icon={Compass} title="No new recommendations right now">We only show people who match your preferences and goals. Check back soon, or widen your preferences.</EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <AnimatePresence>{d.data.recommendations.map((r) => <RecommendationCard key={r.uid} rec={r} onInterested={d.like} onPass={d.pass} onView={setView} />)}</AnimatePresence>
          </div>
        )}
      </section>
      <ViewModal rec={view} onClose={() => setView(null)} onInterested={d.like} onPass={d.pass} />
    </div>
  );
}

function ViewModal({ rec, onClose, onInterested, onPass }) {
  const [full, setFull] = useState(null);
  useEffect(() => {
    setFull(null);
    if (rec) api(`/discover/${rec.uid}`).then((r) => setFull(r.profile)).catch(() => setFull(rec));
  }, [rec]);
  const shown = full || rec;
  return (
    <Modal open={!!rec} onClose={onClose} title={shown?.displayName ?? 'Profile'} wide>
      {shown && <ProfileDetail rec={shown} />}
      {rec && onInterested && (
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={async () => { await onPass(rec); onClose(); }}>Pass</Button>
          <Button onClick={async () => { await onInterested(rec); onClose(); }}><Heart size={15} /> Interested</Button>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ discover
export function Discover() {
  const d = useDiscovery(5);
  const [view, setView] = useState(null);
  const { bind, pulling } = usePullToRefresh(d.reload);
  const recs = d.data?.recommendations ?? [];
  return (
    <div {...bind}>
      <PageHeader title="Today's Connections" subtitle="A short, curated list. Quality over quantity." action={<Button variant="secondary" size="sm" onClick={d.reload} loading={d.loading || pulling}><RefreshCw size={15} /> Refresh</Button>} />
      {d.loading && !d.data ? <CardSkeletons /> : d.error ? (
        d.error.code === 'ONBOARDING_INCOMPLETE'
          ? <EmptyState title="Finish your profile first" action={<Button as={Link} to="/onboarding">Continue setup</Button>}>We need your mindset answers to find compatible people.</EmptyState>
          : <ErrorState error={d.error} onRetry={d.reload} />
      ) : recs.length === 0 ? (
        <EmptyState icon={Sparkles} title="You're all caught up">That's everyone for now. New people appear as the community grows. You can also widen your preferences in your profile.</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <AnimatePresence>{recs.map((r, i) => <RecommendationCard key={r.uid} rank={i + 1} rec={r} onInterested={d.like} onPass={d.pass} onView={setView} />)}</AnimatePresence>
        </div>
      )}
      <ViewModal rec={view} onClose={() => setView(null)} onInterested={d.like} onPass={d.pass} />
    </div>
  );
}

// ------------------------------------------------------------------ matches
export function Matches() {
  const q = useAsync(() => api('/matches'), []);
  const { bind, pulling } = usePullToRefresh(q.reload);
  const [view, setView] = useState(null);
  const { unreadByMatch } = useNotifications();
  return (
    <div {...bind}>
      <PageHeader title="Matches" subtitle="People who are interested in you too." action={pulling ? <RefreshCw className="animate-spin text-brand-300" size={18} /> : null} />
      {q.loading ? <CardSkeletons n={2} /> : q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : q.data.matches.length === 0 ? (
        <EmptyState icon={Heart} title="No matches yet" action={<Button as={Link} to="/discover">Browse today's connections</Button>}>When you and someone else both choose “Interested”, they'll show up here and chat unlocks.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {q.data.matches.map((m) => (
            <Card key={m.matchId} glass className="space-y-3">
              <div className="flex items-center gap-4"><Avatar src={m.photoURL} name={m.displayName} size={56} /><div className="flex-1"><ProfileMeta rec={m} /></div><ScoreRing value={m.score} size={56} /></div>
              <div className="flex flex-wrap gap-2">
                <Button as={Link} to={`/chat/${m.matchId}`} size="sm"><MessageCircle size={15} /> Message{unreadByMatch?.[m.matchId] ? ` (${unreadByMatch[m.matchId]})` : ''}</Button>
                <Button variant="secondary" size="sm" onClick={() => setView(m)}>View Profile</Button>
                <Button as={Link} to={`/compatibility/${m.matchId}`} variant="ghost" size="sm"><FlaskConical size={15} /> Lab</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <ViewModal rec={view} onClose={() => setView(null)} />
    </div>
  );
}

// ------------------------------------------------------------------ pick-a-match helper for lab/icebreakers
function MatchPicker({ base }) {
  const q = useAsync(() => api('/matches'), []);
  if (q.loading) return <CardSkeletons n={2} />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data.matches.length) return <EmptyState icon={Heart} title="You need a match first" action={<Button as={Link} to="/discover">Find connections</Button>}>This feature is for people you've mutually matched with.</EmptyState>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {q.data.matches.map((m) => (
        <Link key={m.matchId} to={`${base}/${m.matchId}`}><Card className="flex items-center gap-3 transition hover:bg-ink-700"><Avatar src={m.photoURL} name={m.displayName} /><div><p className="font-medium text-white">{m.displayName}</p><p className="text-xs text-slate-400">{m.department}</p></div></Card></Link>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ compatibility lab
export function Compatibility() {
  const { matchId } = useParams();
  return (
    <div>
      <PageHeader title="Compatibility Lab" subtitle="A fun little quiz for you and a match. Not a scientific or psychological test." />
      {matchId ? <LabSession matchId={matchId} /> : <MatchPicker base="/compatibility" />}
    </div>
  );
}

function LabSession({ matchId }) {
  const toast = useToast();
  const qs = useAsync(() => api('/lab/questions'), []);
  const st = useAsync(() => api(`/lab/${matchId}`), [matchId]);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);

  if (qs.loading || st.loading) return <CardSkeletons n={2} />;
  if (qs.error || st.error) return <ErrorState error={qs.error || st.error} onRetry={() => { qs.reload(); st.reload(); }} />;
  const s = st.data;
  const questions = qs.data.questions;

  if (s.myAnswered) {
    return s.results ? (
      <div className="grid gap-4 sm:grid-cols-3">
        {[['Communication', s.results.communication], ['Lifestyle', s.results.lifestyle], ['Overall vibe', s.results.overall]].map(([label, v]) => (
          <Card key={label} glass className="flex flex-col items-center gap-3 text-center"><ScoreRing value={v ?? 0} size={80} /><p className="font-medium text-white">{label} Compatibility</p></Card>
        ))}
        <p className="text-xs text-slate-500 sm:col-span-3">{s.disclaimer}</p>
      </div>
    ) : (
      <EmptyState icon={FlaskConical} title="Waiting for your match" action={<Button variant="secondary" onClick={st.reload}><RefreshCw size={15} /> Check again</Button>}>You've answered. Results appear once they answer too. Their individual answers are never shown.</EmptyState>
    );
  }

  const done = questions.every((q) => answers[q.id]);
  const submit = async () => {
    setSaving(true);
    try { await api(`/lab/${matchId}/answers`, { method: 'POST', body: { answers } }); await st.reload(); } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };
  return (
    <div className="space-y-5">
      {questions.map((q, i) => (
        <Card key={q.id}>
          <p className="mb-3 font-medium text-white">{i + 1}. {q.prompt}</p>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={q.prompt}>
            {q.options.map((o) => (
              <button key={o.key} role="radio" aria-checked={answers[q.id] === o.key} onClick={() => setAnswers({ ...answers, [q.id]: o.key })}
                className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${answers[q.id] === o.key ? 'border-brand-400 bg-brand-500/15 text-white' : 'border-line text-slate-300 hover:bg-white/5'}`}>
                <b className="mr-2 text-slate-500">{o.key}</b>{o.label}
              </button>
            ))}
          </div>
        </Card>
      ))}
      <p className="text-xs text-slate-500">{qs.data.disclaimer}</p>
      <Button onClick={submit} disabled={!done} loading={saving}>Submit answers</Button>
    </div>
  );
}

// ------------------------------------------------------------------ icebreakers
export function Icebreakers() {
  const { matchId } = useParams();
  return (
    <div>
      <PageHeader title="Icebreakers" subtitle="Conversation starters based on interests you both chose to share." />
      {matchId ? <IcebreakerList matchId={matchId} /> : <MatchPicker base="/icebreakers" />}
    </div>
  );
}

export function IcebreakerList({ matchId, onPick }) {
  const q = useAsync(() => api(`/matches/${matchId}/icebreakers`), [matchId]);
  if (q.loading) return <CardSkeletons n={2} />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  return (
    <div className="space-y-3">
      {q.data.icebreakers.map((i) => (
        <Card key={i.question} className="space-y-2">
          <p className="text-xs text-slate-400">{i.context}</p>
          <p className="text-white">“{i.question}”</p>
          <Button size="sm" variant="secondary" as={onPick ? 'button' : Link} {...(onPick ? { onClick: () => onPick(i.question) } : { to: `/chat/${matchId}`, state: { draft: i.question } })}>
            {onPick ? 'Use this' : 'Send in chat'}
          </Button>
        </Card>
      ))}
      <p className="text-xs text-slate-500">{q.data.source === 'ai' ? 'Written with AI help from shared interests only.' : 'Generated from shared interests.'} Nothing hidden is ever used.</p>
    </div>
  );
}
