import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import {
  AlertTriangle, BarChart3, Bell, Check, Compass, FlaskConical, Heart, House, Inbox, Loader2, LogOut, MessageCircle,
  Settings as SettingsIcon, ShieldCheck, Sparkles, User, X,
} from 'lucide-react';
import { db, useAuth } from '../firebase/auth.jsx';

export const cn = (...c) => c.filter(Boolean).join(' ');

// ================================================================== hooks
export function useDebounce(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Pull-to-refresh for touch devices. Attach `bind` to the scroll container; `pulling` drives a spinner. */
export function usePullToRefresh(onRefresh) {
  const start = useRef(null);
  const [pulling, setPulling] = useState(false);
  const bind = {
    onTouchStart: (e) => { start.current = window.scrollY <= 0 ? e.touches[0].clientY : null; },
    onTouchEnd: async (e) => {
      if (start.current === null) return;
      const dy = e.changedTouches[0].clientY - start.current;
      start.current = null;
      if (dy > 90) {
        setPulling(true);
        try { await onRefresh(); } finally { setPulling(false); }
      }
    },
  };
  return { bind, pulling };
}

/** Loads async data with loading/error state and a reload() function. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      setState({ loading: false, error: null, data: await fn() });
    } catch (error) {
      setState({ loading: false, error, data: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) };
}

// ================================================================== toasts
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x.slice(-3), { id, message, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4500);
  }, []);
  const api = useMemo(() => ({ success: (m) => push(m, 'success'), error: (m) => push(m, 'error'), info: (m) => push(m, 'info') }), [push]);
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6" role="status" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={cn('pointer-events-auto flex max-w-md items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-xl',
                t.kind === 'error' ? 'border-red-500/30 bg-red-950/90 text-red-100' : t.kind === 'success' ? 'border-emerald-500/30 bg-emerald-950/90 text-emerald-100' : 'border-line bg-ink-800 text-slate-100')}>
              {t.kind === 'error' ? <AlertTriangle size={16} /> : t.kind === 'success' ? <Check size={16} /> : <Sparkles size={16} />}
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

// ================================================================== primitives
export function Logo({ size = 28, text = true }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <span className="brand-gradient grid place-items-center rounded-lg" style={{ width: size, height: size }} aria-hidden>
        <svg viewBox="0 0 32 32" width={size * 0.7} height={size * 0.7} fill="none" stroke="white" strokeWidth="2.4"><circle cx="11.5" cy="16" r="5.5" /><circle cx="20.5" cy="16" r="5.5" /></svg>
      </span>
      {text && <span className="text-lg text-white">MindMesh</span>}
    </span>
  );
}

const BTN = {
  primary: 'brand-gradient text-white shadow-lg shadow-brand-600/20 hover:brightness-110',
  secondary: 'surface text-slate-100 hover:bg-ink-700',
  ghost: 'text-slate-300 hover:bg-white/5',
  danger: 'bg-red-600/90 text-white hover:bg-red-600',
  outlineDanger: 'border border-red-500/40 text-red-300 hover:bg-red-500/10',
};
export function Button({ variant = 'primary', size = 'md', loading, disabled, className, children, as: As = 'button', ...rest }) {
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <As
      className={cn('inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50', BTN[variant], sizes[size], className)}
      disabled={As === 'button' ? disabled || loading : undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </As>
  );
}

export const Card = ({ className, children, glass, ...rest }) => (
  <div className={cn('rounded-2xl p-5', glass ? 'glass' : 'surface', className)} {...rest}>{children}</div>
);

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-200">{label}</label>}
      {children}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
    </div>
  );
}
const inputCls = 'w-full rounded-xl border border-line bg-ink-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-400 focus:outline-none';
export const Input = ({ className, ...p }) => <input className={cn(inputCls, className)} {...p} />;
export const Textarea = ({ className, ...p }) => <textarea className={cn(inputCls, 'min-h-24 resize-y', className)} {...p} />;
export const Select = ({ className, children, ...p }) => <select className={cn(inputCls, className)} {...p}>{children}</select>;

export const Chip = ({ children, active, onClick, className, ...p }) => {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-pressed={onClick ? !!active : undefined}
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition',
        active ? 'border-brand-400 bg-brand-500/15 text-brand-300' : 'border-line bg-white/[0.03] text-slate-300', onClick && !active && 'hover:bg-white/10', className)} {...p}>
      {children}
    </Tag>
  );
};

export const Badge = ({ tone = 'neutral', children, className }) => (
  <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
    { neutral: 'bg-white/5 text-slate-300', good: 'bg-emerald-500/15 text-emerald-300', warn: 'bg-amber-500/15 text-amber-300', bad: 'bg-red-500/15 text-red-300', brand: 'bg-brand-500/15 text-brand-300' }[tone], className)}>
    {children}
  </span>
);

/** "Verified Student" + university. Shows trust without exposing any verification data. */
export const VerifiedBadge = ({ university }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
    <ShieldCheck size={14} /> Verified Student{university ? <span className="text-slate-400"> · {university}</span> : null}
  </span>
);

export function Avatar({ src, name = '?', size = 48, className }) {
  const initials = String(name).replace(/^Profile\s*/i, '').slice(0, 2).toUpperCase();
  return src ? (
    <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" className={cn('rounded-full object-cover', className)} style={{ width: size, height: size }} />
  ) : (
    <span className={cn('grid shrink-0 place-items-center rounded-full bg-ink-600 font-semibold text-brand-300', className)} style={{ width: size, height: size, fontSize: size * 0.34 }} aria-hidden>{initials}</span>
  );
}

export function ProgressBar({ value, className }) {
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-ink-600', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <motion.div className="brand-gradient h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
    </div>
  );
}

export function ScoreRing({ value, size = 64 }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${value}% compatible`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-ink-600)" strokeWidth="5" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-brand-400)" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value / 100) }} transition={{ duration: 0.9, ease: 'easeOut' }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-semibold text-white">{value}%</span>
    </div>
  );
}

export const Skeleton = ({ className }) => <div className={cn('skeleton', className)} aria-hidden />;
export const Spinner = ({ className }) => <Loader2 className={cn('animate-spin text-brand-400', className)} aria-label="Loading" />;

export function EmptyState({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-white/5 text-brand-300"><Icon size={22} /></div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-sm text-slate-400">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "Couldn't load this" }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-red-500/20 bg-red-500/5 px-6 py-12 text-center" role="alert">
      <AlertTriangle className="mb-3 text-red-300" />
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-400">{error?.message || 'Please try again.'}</p>
      {onRetry && <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export const PageHeader = ({ title, subtitle, action }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50', checked ? 'bg-brand-500' : 'bg-ink-600')}>
      <span className={cn('absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition', checked && 'translate-x-5')} />
    </button>
  );
}

export function Slider({ left, right, value, onChange, id }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm"><span className={value < 45 ? 'text-brand-300' : 'text-slate-400'}>{left}</span><span className={value > 55 ? 'text-brand-300' : 'text-slate-400'}>{right}</span></div>
      <input id={id} type="range" min={0} max={100} step={5} value={value ?? 50} onChange={(e) => onChange(Number(e.target.value))} aria-label={`${left} to ${right}`} />
    </div>
  );
}

// ================================================================== modal + confirm
export function Modal({ open, onClose, title, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement;
    ref.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid items-end bg-black/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            className={cn('glass max-h-[90vh] w-full overflow-y-auto rounded-t-3xl p-6 outline-none sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-white/10"><X size={18} /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel = 'Confirm', danger }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await onConfirm(); onClose(); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-sm leading-relaxed text-slate-300">{children}</div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={go}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

// ================================================================== error boundary
export class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('[ui]', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-[60vh] place-items-center p-6">
        <ErrorState title="Something broke on this page" error={{ message: 'The error has been logged. Reloading usually fixes it.' }} onRetry={() => { this.setState({ error: null }); window.location.reload(); }} />
      </div>
    );
  }
}

export const PageTransition = ({ children }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>{children}</motion.div>
);

// ================================================================== notifications (realtime)
const NotifCtx = createContext({ items: [], unread: 0, unreadMessages: 0, newMatches: 0, markRead: () => {}, markAllRead: () => {} });
export const useNotifications = () => useContext(NotifCtx);

export function NotificationsProvider({ children }) {
  const { uid } = useAuth();
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!uid || !db) return undefined;
    const q = query(collection(db, 'notifications'), where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(30));
    return onSnapshot(q, (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.warn('[notifications]', e.code));
  }, [uid]);
  const markRead = useCallback((id) => updateDoc(doc(db, 'notifications', id), { read: true }).catch(() => {}), []);
  const value = useMemo(() => {
    const unreadItems = items.filter((n) => !n.read);
    return {
      items,
      unread: unreadItems.length,
      unreadMessages: unreadItems.filter((n) => n.type === 'MESSAGE').reduce((s, n) => s + (n.data?.count || 1), 0),
      newMatches: unreadItems.filter((n) => n.type === 'MATCH').length,
      unreadByMatch: Object.fromEntries(unreadItems.filter((n) => n.type === 'MESSAGE').map((n) => [n.data?.matchId, n.data?.count || 1])),
      markRead,
      markAllRead: () => unreadItems.forEach((n) => markRead(n.id)),
    };
  }, [items, markRead]);
  return <NotifCtx.Provider value={value}>{children}</NotifCtx.Provider>;
}

function NotificationBell() {
  const { items, unread, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const go = (n) => {
    markRead(n.id);
    setOpen(false);
    if (n.type === 'MATCH' || n.type === 'MESSAGE') nav(`/chat/${n.data?.matchId}`);
    else if (n.type === 'INTEREST') nav('/discover');
  };
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} className="relative rounded-xl p-2 text-slate-300 hover:bg-white/5">
        <Bell size={20} />
        {unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass absolute right-0 z-40 mt-2 w-80 max-w-[90vw] rounded-2xl p-2 shadow-2xl">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-sm font-semibold text-white">Notifications</span>
                {unread > 0 && <button onClick={markAllRead} className="text-xs text-brand-300 hover:underline">Mark all read</button>}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {items.length === 0 && <p className="px-3 py-8 text-center text-sm text-slate-400">You're all caught up.</p>}
                {items.map((n) => (
                  <button key={n.id} onClick={() => go(n)} className={cn('flex w-full gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/5', !n.read && 'bg-brand-500/5')}>
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand-400')} />
                    <span><span className="block text-sm font-medium text-slate-100">{n.title}</span><span className="block text-xs text-slate-400">{n.body}</span></span>
                  </button>
                ))}
              </div>
              <Link to="/settings" onClick={() => setOpen(false)} className="block px-3 py-2 text-center text-xs text-slate-400 hover:text-slate-200">Notification settings</Link>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ================================================================== layout
const NAV = [
  { to: '/dashboard', label: 'Home', icon: House },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/matches', label: 'Matches', icon: Heart },
  { to: '/chat', label: 'Messages', icon: MessageCircle },
  { to: '/profile', label: 'Profile', icon: User },
];
const EXTRA = [
  { to: '/compatibility', label: 'Compatibility Lab', icon: FlaskConical },
  { to: '/icebreakers', label: 'Icebreakers', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function AppShell() {
  const { me, logout } = useAuth();
  const { unreadMessages } = useNotifications();
  const loc = useLocation();
  const isStaff = !!me?.role;
  const link = ({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition', isActive ? 'bg-brand-500/15 text-brand-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100');
  return (
    <div className="min-h-full md:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-ink-900/70 p-4 backdrop-blur md:flex">
        <Link to="/dashboard" className="mb-8 px-2 pt-2"><Logo /></Link>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          {[...NAV, ...EXTRA].map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={link}>
              <Icon size={18} /> {label}
              {to === '/chat' && unreadMessages > 0 && <span className="ml-auto rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white">{unreadMessages}</span>}
            </NavLink>
          ))}
          {isStaff && <NavLink to="/admin" className={link}><BarChart3 size={18} /> Admin</NavLink>}
        </nav>
        <button onClick={logout} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 hover:bg-white/5"><LogOut size={18} /> Sign out</button>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-ink-950/80 px-4 py-3 backdrop-blur md:justify-end">
        <Link to="/dashboard" className="md:hidden"><Logo size={26} /></Link>
        <div className="flex items-center gap-1"><NotificationBell /></div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 md:px-8 md:pb-10">
        <ErrorBoundary key={loc.pathname}><PageTransition><Outlet /></PageTransition></ErrorBoundary>
      </main>

      <nav className="safe-bottom glass fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line md:hidden" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => cn('relative flex flex-col items-center gap-0.5 py-2.5 text-[11px]', isActive ? 'text-brand-300' : 'text-slate-400')}>
            <Icon size={20} />{label}
            {to === '/chat' && unreadMessages > 0 && <span className="absolute right-[28%] top-1.5 h-2 w-2 rounded-full bg-brand-400" />}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export const FullPageSpinner = () => <div className="grid min-h-screen place-items-center"><Spinner className="h-8 w-8" /></div>;

// ================================================================== route guards
export function RequireAuth() {
  const { booting, fbUser, me, meError, loadMe } = useAuth();
  const loc = useLocation();
  if (booting) return <FullPageSpinner />;
  if (!fbUser) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!me) return <div className="grid min-h-screen place-items-center p-6">{meError ? <ErrorState error={meError} onRetry={loadMe} title="Can't reach MindMesh" /> : <Spinner className="h-8 w-8" />}</div>;
  if (me.user?.status === 'SUSPENDED') return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Requires a verified university email. */
export function RequireVerified() {
  const { me } = useAuth();
  if (!me.emailVerified || !me.profile?.verified) return <Navigate to="/verify" replace />;
  return <Outlet />;
}

/** Requires the mindset questionnaire to be complete. */
export function RequireOnboarded() {
  const { me } = useAuth();
  if (!me.profile?.onboardingComplete) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

export function RequireStaff() {
  const { me } = useAuth();
  if (!me.role) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

/** Signed-in users shouldn't see login/register. */
export function PublicOnly() {
  const { booting, fbUser, me } = useAuth();
  if (booting) return <FullPageSpinner />;
  if (fbUser && me) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
