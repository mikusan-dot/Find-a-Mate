import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { initializeApp } from 'firebase/app';
import {
  EmailAuthProvider,
  browserSessionPersistence,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const configured = Boolean(config.apiKey && config.projectId && config.appId);

let app = null, auth = null, db = null, storage = null;
if (configured) {
  app = initializeApp(config);
  // IndexedDB (not localStorage) keeps tokens out of localStorage; falls back to per-tab session storage.
  auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserSessionPersistence] });
  db = getFirestore(app);
  storage = getStorage(app);
}
export { auth, db, storage };

// ------------------------------------------------------------------ API client
export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function rawFetch(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.code);
  return data;
}

/** Authenticated call: attaches a fresh ID token, retries once with a force-refreshed token on 401. */
export async function api(path, opts = {}) {
  const user = auth?.currentUser;
  if (!user) return rawFetch(path, opts);
  try {
    return await rawFetch(path, { ...opts, token: await user.getIdToken() });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return rawFetch(path, { ...opts, token: await user.getIdToken(true) });
    throw e;
  }
}
export const publicApi = (path, opts = {}) => rawFetch(path, opts);

// ------------------------------------------------------------------ context
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [fbUser, setFbUser] = useState(null);
  const [me, setMe] = useState(null); // account + own profile from the API
  const [booting, setBooting] = useState(configured);
  const [meError, setMeError] = useState(null);
  const alive = useRef(true);

  const loadMe = useCallback(async () => {
    try {
      setMeError(null);
      const data = await api('/me');
      if (alive.current) setMe(data);
      return data;
    } catch (e) {
      if (alive.current) setMeError(e);
      return null;
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!configured) return undefined;
    const off = onAuthStateChanged(auth, async (u) => {
      setFbUser(u);
      if (u) await loadMe();
      else setMe(null);
      if (alive.current) setBooting(false);
    });
    return () => { alive.current = false; off(); };
  }, [loadMe]);

  const login = useCallback(async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setMe(null);
  }, []);

  const register = useCallback(async (form) => {
    await publicApi('/auth/register', { method: 'POST', body: form });
    const user = await login(form.email, form.password);
    await sendEmailVerification(user);
  }, [login]);

  const resendVerification = useCallback(async () => {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser);
  }, []);

  /** Reload the user, refresh the token (so email_verified is current), then promote the profile server-side. */
  const checkVerification = useCallback(async () => {
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    if (!auth.currentUser.emailVerified) return false;
    await api('/auth/sync-verification', { method: 'POST' });
    await loadMe();
    return true;
  }, [loadMe]);

  const resetPassword = useCallback((email) => sendPasswordResetEmail(auth, email.trim()), []);

  const changePassword = useCallback(async (current, next) => {
    const u = auth.currentUser;
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
    await updatePassword(u, next);
    api('/security/event', { method: 'POST', body: { kind: 'PASSWORD_CHANGED' } }).catch(() => {});
  }, []);

  const deleteAccount = useCallback(async () => {
    await api('/account', { method: 'DELETE', body: { confirm: 'DELETE' } });
    await signOut(auth).catch(() => {});
    setMe(null);
  }, []);

  const value = useMemo(
    () => ({ configured, booting, fbUser, me, meError, uid: fbUser?.uid ?? null, loadMe, login, logout, register, resendVerification, checkVerification, resetPassword, changePassword, deleteAccount }),
    [booting, fbUser, me, meError, loadMe, login, logout, register, resendVerification, checkVerification, resetPassword, changePassword, deleteAccount],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Friendly messages for Firebase Auth error codes. */
export function authMessage(e) {
  const map = {
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/user-not-found': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/user-disabled': 'This account has been suspended.',
    'auth/requires-recent-login': 'Please sign in again to do this.',
    'auth/weak-password': 'Choose a stronger password (8+ characters).',
    'auth/network-request-failed': 'Network error. Check your connection.',
  };
  return map[e?.code] || e?.message || 'Something went wrong.';
}
