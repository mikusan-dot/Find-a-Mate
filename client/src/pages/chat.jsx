import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { addDoc, collection, doc, limitToLast, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch, arrayUnion } from 'firebase/firestore';
import { ArrowLeft, Ban, Check, CheckCheck, Flag, MessageCircle, MoreVertical, Send, Smile, Sparkles, Trash2, UserX } from 'lucide-react';
import { api, db, useAuth } from '../firebase/auth.jsx';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Modal, Skeleton, Textarea, cn, useAsync, useNotifications, useToast } from '../components/index.jsx';
import { EMOJIS, REPORT_CATEGORIES } from '../lib/constants.js';
import { ProfileDetail, IcebreakerList } from './main.jsx';

const fmt = (ms) => (ms ? new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
const dayLabel = (ms) => new Date(ms).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

export function Chat() {
  const { matchId } = useParams();
  const q = useAsync(() => api('/matches'), []);
  const { unreadByMatch } = useNotifications();

  return (
    <div className="-mx-4 grid h-[calc(100dvh-8.5rem)] md:mx-0 md:h-[calc(100dvh-7rem)] md:grid-cols-[18rem_1fr] md:gap-4">
      <aside className={cn('overflow-y-auto md:block', matchId && 'hidden')}>
        <h1 className="mb-3 px-4 text-2xl font-semibold text-white md:px-0">Messages</h1>
        {q.loading ? <div className="space-y-2 px-4 md:px-0">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div> : q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : q.data.matches.length === 0 ? (
          <div className="px-4 md:px-0"><EmptyState icon={MessageCircle} title="No conversations yet" action={<Button as={Link} to="/discover" size="sm">Find connections</Button>}>Chat opens after a mutual match.</EmptyState></div>
        ) : (
          <ul className="space-y-1 px-2 md:px-0">
            {q.data.matches.map((m) => (
              <li key={m.matchId}>
                <Link to={`/chat/${m.matchId}`} className={cn('flex items-center gap-3 rounded-xl p-3 transition hover:bg-white/5', matchId === m.matchId && 'bg-brand-500/10')}>
                  <Avatar src={m.photoURL} name={m.displayName} />
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium text-white">{m.displayName}</span><span className="block truncate text-xs text-slate-400">{m.department || 'Tap to chat'}</span></span>
                  {unreadByMatch?.[m.matchId] ? <Badge tone="brand">{unreadByMatch[m.matchId]}</Badge> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <section className={cn('min-h-0', !matchId && 'hidden md:grid md:place-items-center')}>
        {matchId ? <Conversation key={matchId} matchId={matchId} /> : <p className="text-sm text-slate-500">Select a conversation</p>}
      </section>
    </div>
  );
}

function Conversation({ matchId }) {
  const { uid } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const info = useAsync(() => api(`/matches/${matchId}`), [matchId]);
  const [conv, setConv] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [count, setCount] = useState(50);
  const [text, setText] = useState(loc.state?.draft || '');
  const [sending, setSending] = useState(false);
  const [modal, setModal] = useState(null); // 'menu' | 'unmatch' | 'block' | 'delete' | 'report' | 'profile' | 'icebreakers'
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const bottom = useRef(null);
  const lastTyping = useRef(0);
  const match = info.data?.match;

  // realtime: conversation doc (active flag + typing) and messages
  useEffect(() => {
    const off1 = onSnapshot(doc(db, 'conversations', matchId), (s) => setConv(s.exists() ? s.data() : { active: false }), () => setConv({ active: false }));
    const off2 = onSnapshot(
      query(collection(db, 'messages', matchId, 'items'), orderBy('createdAt', 'asc'), limitToLast(count)),
      (s) => setMsgs(s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))),
      () => setMsgs([]),
    );
    return () => { off1(); off2(); };
  }, [matchId, count]);

  // mark incoming as read + clear this chat's notification
  useEffect(() => {
    const unread = msgs.filter((m) => m.senderId !== uid && !m.deleted && !(m.readBy || []).includes(uid));
    if (unread.length) {
      const b = writeBatch(db);
      unread.forEach((m) => b.update(doc(db, 'messages', matchId, 'items', m.id), { readBy: arrayUnion(uid) }));
      b.commit().catch(() => {});
    }
    updateDoc(doc(db, 'notifications', `msg_${matchId}_${uid}`), { read: true }).catch(() => {});
  }, [msgs, matchId, uid]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 2000); return () => clearInterval(t); }, []);

  const active = conv?.active === true;
  const otherTyping = useMemo(() => {
    const t = conv?.typing || {};
    return Object.entries(t).some(([k, v]) => k !== uid && now - Number(v) < 4000);
  }, [conv, uid, now]);

  const onType = (v) => {
    setText(v);
    if (active && Date.now() - lastTyping.current > 2000) {
      lastTyping.current = Date.now();
      updateDoc(doc(db, 'conversations', matchId), { [`typing.${uid}`]: Date.now() }).catch(() => {});
    }
  };

  const send = async (e) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || !active || sending) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'messages', matchId, 'items'), { conversationId: matchId, senderId: uid, text: t.slice(0, 2000), createdAt: serverTimestamp(), deleted: false, readBy: [uid] });
      setText(''); setEmojiOpen(false);
      api(`/conversations/${matchId}/ping`, { method: 'POST' }).catch(() => {});
    } catch { toast.error("Couldn't send. The conversation may have ended."); } finally { setSending(false); }
  };

  const removeMsg = (m) => updateDoc(doc(db, 'messages', matchId, 'items', m.id), { deleted: true, text: '' }).catch(() => toast.error("Couldn't delete that message."));

  const doUnmatch = async () => { await api(`/matches/${matchId}/unmatch`, { method: 'POST' }); toast.info('Unmatched. The conversation is closed.'); nav('/chat'); };
  const doDelete = async () => { await api(`/matches/${matchId}/delete-conversation`, { method: 'POST' }); toast.info('Conversation deleted for both of you.'); nav('/chat'); };
  const doBlock = async () => { await api(`/blocks/${match.uid}`, { method: 'POST' }); toast.info('Blocked. You will not see each other again.'); nav('/chat'); };

  if (info.loading || !conv) return <Skeleton className="h-full" />;
  if (info.error) return <ErrorState error={info.error} title="This conversation isn't available" onRetry={() => nav('/chat')} />;

  let lastDay = '';
  return (
    <div className="flex h-full min-h-0 flex-col md:rounded-2xl md:border md:border-line md:bg-ink-900/50">
      <header className="flex items-center gap-3 border-b border-line px-3 py-3">
        <Link to="/chat" className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 md:hidden" aria-label="Back"><ArrowLeft size={20} /></Link>
        <button className="flex flex-1 items-center gap-3 text-left" onClick={() => setModal('profile')}>
          <Avatar src={match.photoURL} name={match.displayName} size={40} />
          <span><span className="block font-medium text-white">{match.displayName}</span><span className="block text-xs text-slate-400">{otherTyping ? 'typing…' : 'Verified Student'}</span></span>
        </button>
        <Button variant="ghost" size="sm" onClick={() => setModal('icebreakers')} aria-label="Icebreakers" disabled={!active}><Sparkles size={16} /></Button>
        <Button variant="ghost" size="sm" onClick={() => setModal('menu')} aria-label="More options"><MoreVertical size={18} /></Button>
      </header>

      <div className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4" aria-live="polite">
        {msgs.length >= count && <div className="text-center"><button className="text-xs text-brand-300 hover:underline" onClick={() => setCount(count + 50)}>Load earlier messages</button></div>}
        {msgs.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Say hi 👋 or tap ✨ for a conversation starter.</p>}
        {msgs.map((m) => {
          const mine = m.senderId === uid;
          const ms = m.createdAt?.toMillis?.() ?? Date.now();
          const d = dayLabel(ms);
          const header = d !== lastDay ? d : null;
          lastDay = d;
          const read = (m.readBy || []).some((u) => u !== m.senderId);
          return (
            <div key={m.id}>
              {header && <p className="my-3 text-center text-[11px] text-slate-500">{header}</p>}
              <div className={cn('group flex items-end gap-1.5', mine ? 'justify-end' : 'justify-start')}>
                {mine && !m.deleted && <button onClick={() => removeMsg(m)} aria-label="Delete message" className="rounded p-1 text-slate-600 opacity-0 transition hover:text-red-300 focus:opacity-100 group-hover:opacity-100"><Trash2 size={13} /></button>}
                <div className={cn('max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm', mine ? 'brand-gradient rounded-br-md text-white' : 'rounded-bl-md bg-ink-700 text-slate-100', m.deleted && 'italic opacity-60')}>
                  {m.deleted ? 'Message deleted' : m.text}
                  <span className={cn('ml-2 inline-flex items-center gap-1 align-bottom text-[10px]', mine ? 'text-white/70' : 'text-slate-400')}>{fmt(ms)}{mine && !m.deleted && (read ? <CheckCheck size={12} aria-label="Read" /> : <Check size={12} aria-label="Sent" />)}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {active ? (
        <form onSubmit={send} className="safe-bottom relative border-t border-line p-3">
          {emojiOpen && <div className="glass absolute bottom-full left-3 mb-2 grid grid-cols-8 gap-1 rounded-2xl p-2">{EMOJIS.map((e) => <button type="button" key={e} className="rounded-lg p-1.5 text-xl hover:bg-white/10" onClick={() => setText((t) => t + e)}>{e}</button>)}</div>}
          <div className="flex items-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEmojiOpen((o) => !o)} aria-label="Emoji" aria-expanded={emojiOpen}><Smile size={20} /></Button>
            <Textarea rows={1} value={text} maxLength={2000} placeholder="Write a message…" aria-label="Message" className="max-h-32 min-h-10 flex-1 py-2.5" onChange={(e) => onType(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }} />
            <Button type="submit" size="sm" disabled={!text.trim()} loading={sending} aria-label="Send"><Send size={16} /></Button>
          </div>
        </form>
      ) : (
        <p className="border-t border-line p-4 text-center text-sm text-slate-400">This conversation has ended.</p>
      )}

      <Modal open={modal === 'menu'} onClose={() => setModal(null)} title="Conversation">
        <div className="space-y-1">
          {[['report', Flag, 'Report', 'text-slate-200'], ['unmatch', UserX, 'Unmatch', 'text-slate-200'], ['delete', Trash2, 'Delete conversation', 'text-slate-200'], ['block', Ban, 'Block', 'text-red-300']].map(([k, Icon, label, c]) => (
            <button key={k} onClick={() => setModal(k)} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-white/5', c)}><Icon size={17} /> {label}</button>
          ))}
        </div>
      </Modal>
      <ConfirmDialog open={modal === 'unmatch'} onClose={() => setModal(null)} onConfirm={doUnmatch} title="Unmatch?" confirmLabel="Unmatch" danger>The conversation closes immediately for both of you and you won't be recommended to each other again.</ConfirmDialog>
      <ConfirmDialog open={modal === 'delete'} onClose={() => setModal(null)} onConfirm={doDelete} title="Delete conversation?" confirmLabel="Delete" danger>This ends the match and permanently deletes every message for both of you. It can't be undone.</ConfirmDialog>
      <ConfirmDialog open={modal === 'block'} onClose={() => setModal(null)} onConfirm={doBlock} title={`Block ${match.displayName}?`} confirmLabel="Block" danger>You'll disappear from each other's recommendations and can no longer match or message.</ConfirmDialog>
      <ReportModal open={modal === 'report'} onClose={() => setModal(null)} reportedUid={match.uid} />
      <Modal open={modal === 'profile'} onClose={() => setModal(null)} title="Profile" wide><ProfileDetail rec={match} /></Modal>
      <Modal open={modal === 'icebreakers'} onClose={() => setModal(null)} title="Conversation starters"><IcebreakerList matchId={matchId} onPick={(q) => { setText(q); setModal(null); }} /></Modal>
    </div>
  );
}

export function ReportModal({ open, onClose, reportedUid, withEvidence = true }) {
  const toast = useToast();
  const [category, setCategory] = useState('');
  const [details, setDetails] = useState('');
  const [evidence, setEvidence] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api('/reports', { method: 'POST', body: { reportedUid, category, details, includeRecentMessages: withEvidence && evidence } });
      toast.success(r.message); onClose(); setCategory(''); setDetails(''); setEvidence(false);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Report this person">
      <div className="space-y-4">
        <Field label="What's the problem?"><div className="flex flex-wrap gap-2" role="radiogroup">{REPORT_CATEGORIES.map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={category === id} onClick={() => setCategory(id)} className={cn('rounded-full border px-3 py-1.5 text-sm', category === id ? 'border-brand-400 bg-brand-500/15 text-brand-300' : 'border-line text-slate-300 hover:bg-white/5')}>{label}</button>)}</div></Field>
        <Field label="Details (optional)" htmlFor="rd"><Textarea id="rd" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} /></Field>
        {withEvidence && <label className="flex items-start gap-3 text-sm text-slate-300"><input type="checkbox" className="mt-1 h-4 w-4 accent-brand-500" checked={evidence} onChange={(e) => setEvidence(e.target.checked)} /><span>Share the last 10 messages of this conversation with moderators. Otherwise they can't see any messages.</span></label>}
      </div>
      <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!category} onClick={submit}>Submit report</Button></div>
    </Modal>
  );
}
