import { db, FieldValue } from '../firebase.js';
import { DEFAULT_WEIGHTS } from '../config/constants.js';
import { normalizeWeights } from './matchingEngine.js';

// ---- small TTL cache for rarely-changing config -------------------------------------------
const cache = new Map();
async function cached(key, ttlMs, load) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  const value = await load();
  cache.set(key, { value, exp: Date.now() + ttlMs });
  return value;
}
export const bustCache = (key) => (key ? cache.delete(key) : cache.clear());

export const getWeights = () =>
  cached('weights', 60_000, async () => {
    const snap = await db().doc('config/matching').get();
    return normalizeWeights(snap.exists ? snap.data().weights : DEFAULT_WEIGHTS);
  });

export const getUniversity = (id) =>
  cached(`uni:${id}`, 5 * 60_000, async () => {
    if (!id) return null;
    const snap = await db().doc(`universities/${id}`).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  });

// ---- profiles ---------------------------------------------------------------------------
export async function getProfile(uid) {
  const snap = await db().doc(`profiles/${uid}`).get();
  return snap.exists ? { uid, ...snap.data() } : null;
}

/** uids that must never be shown to `uid`, in either direction (blocked by me, or blocking me). */
export async function getBlockedSet(uid) {
  const [mine, theirs] = await Promise.all([
    db().collection('blocks').where('blocker', '==', uid).get(),
    db().collection('blocks').where('blocked', '==', uid).get(),
  ]);
  const s = new Set();
  mine.forEach((d) => s.add(d.data().blocked));
  theirs.forEach((d) => s.add(d.data().blocker));
  return s;
}

/** uids this user already liked or passed. */
export async function getSeenSet(uid) {
  const [likes, passes] = await Promise.all([
    db().collection('likes').where('from', '==', uid).get(),
    db().collection('passes').where('from', '==', uid).get(),
  ]);
  const s = new Set();
  likes.forEach((d) => s.add(d.data().to));
  passes.forEach((d) => s.add(d.data().to));
  return s;
}

// ---- notifications ----------------------------------------------------------------------
const PREF_KEY = { MATCH: 'matches', MESSAGE: 'messages', INTEREST: 'interests', REPORT_UPDATE: 'reports' };

export async function notify(uid, type, title, body, data = {}, docId = null) {
  if (PREF_KEY[type]) {
    const u = await db().doc(`users/${uid}`).get();
    if (u.exists && u.data().notifPrefs?.[PREF_KEY[type]] === false) return;
  }
  const ref = docId ? db().doc(`notifications/${docId}`) : db().collection('notifications').doc();
  await ref.set({ uid, type, title, body, data, read: false, createdAt: FieldValue.serverTimestamp() });
}

// ---- audit ------------------------------------------------------------------------------
export async function logAdmin(actor, action, target = null, meta = {}) {
  await db().collection('adminLogs').add({
    actorUid: actor.uid,
    actorRole: actor.role,
    action,
    target,
    meta,
    createdAt: FieldValue.serverTimestamp(),
  });
}

// ---- batch deletes ----------------------------------------------------------------------
export async function deleteQuery(query, batchSize = 400) {
  let total = 0;
  for (;;) {
    const snap = await query.limit(batchSize).get();
    if (snap.empty) return total;
    const batch = db().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    if (snap.size < batchSize) return total;
  }
}

export async function deleteConversationData(convId) {
  await deleteQuery(db().collection(`messages/${convId}/items`));
  await db().doc(`conversations/${convId}`).delete().catch(() => {});
}
