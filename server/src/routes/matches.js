import { Router } from 'express';
import { db, FieldValue } from '../firebase.js';
import { asyncHandler, HttpError, requireAuth, requireVerifiedEmail } from '../middleware/auth.js';
import { scoreCompatibility, sharedInterests } from '../services/matchingEngine.js';
import { generateIcebreaker } from '../services/aiMatchingService.js';
import { canSee } from '../services/privacy.js';
import { DEFAULT_PRIVACY } from '../config/constants.js';
import { buildRecommendation } from '../services/recommendations.js';
import { deleteConversationData, getProfile, getWeights, notify } from '../services/data.js';
import { dirId, otherOf } from '../utils/ids.js';

export const matchesRouter = Router();
matchesRouter.use(['/matches', '/conversations'], requireAuth, requireVerifiedEmail);

export async function loadMatch(id, uid, { requireActive = true } = {}) {
  const snap = await db().doc(`matches/${id}`).get();
  if (!snap.exists || !snap.data().users.includes(uid)) throw new HttpError(404, 'Match not found', 'NOT_FOUND');
  if (requireActive && !snap.data().active) throw new HttpError(410, 'This match is no longer active', 'MATCH_INACTIVE');
  return { id: snap.id, ...snap.data() };
}

async function card(viewer, otherUid, match) {
  const other = await getProfile(otherUid);
  if (!other || other.status !== 'ACTIVE') return null;
  const { score, breakdown } = scoreCompatibility(viewer, other, await getWeights());
  const rec = await buildRecommendation(viewer, other, { score, breakdown, matched: true });
  return { matchId: match.id, conversationId: match.conversationId, createdAt: match.createdAt?.toMillis?.() ?? null, ...rec };
}

matchesRouter.get(
  '/matches',
  asyncHandler(async (req, res) => {
    const viewer = await getProfile(req.user.uid);
    const snap = await db().collection('matches').where('users', 'array-contains', req.user.uid).where('active', '==', true).limit(100).get();
    const matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const cards = (await Promise.all(matches.map((m) => card(viewer, otherOf(m.users, req.user.uid), m)))).filter(Boolean);
    cards.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    res.json({ matches: cards });
  }),
);

matchesRouter.get(
  '/matches/:id',
  asyncHandler(async (req, res) => {
    const m = await loadMatch(req.params.id, req.user.uid);
    const viewer = await getProfile(req.user.uid);
    const c = await card(viewer, otherOf(m.users, req.user.uid), m);
    if (!c) throw new HttpError(404, 'Match not found', 'NOT_FOUND');
    res.json({ match: c });
  }),
);

async function deactivate(m, uid) {
  const other = otherOf(m.users, uid);
  const batch = db().batch();
  batch.update(db().doc(`matches/${m.id}`), { active: false, endedAt: FieldValue.serverTimestamp(), endedBy: uid });
  batch.set(db().doc(`conversations/${m.id}`), { active: false, typing: {}, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  // Prevent either side from resurfacing in the other's discovery.
  batch.set(db().doc(`passes/${dirId(uid, other)}`), { from: uid, to: other, createdAt: FieldValue.serverTimestamp() });
  batch.set(db().doc(`passes/${dirId(other, uid)}`), { from: other, to: uid, createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
}

/** Unmatching disables the conversation immediately (rules require conversations.active == true). */
matchesRouter.post(
  '/matches/:id/unmatch',
  asyncHandler(async (req, res) => {
    const m = await loadMatch(req.params.id, req.user.uid);
    await deactivate(m, req.user.uid);
    res.json({ ok: true });
  }),
);

/** Ends the match AND permanently deletes the message history for both people. */
matchesRouter.post(
  '/matches/:id/delete-conversation',
  asyncHandler(async (req, res) => {
    const m = await loadMatch(req.params.id, req.user.uid, { requireActive: false });
    if (m.active) await deactivate(m, req.user.uid);
    await deleteConversationData(m.id);
    res.json({ ok: true });
  }),
);

/**
 * Called by the client after sending a message so the recipient gets ONE rolling notification
 * (no Cloud Functions needed). Verifies the caller really sent the latest message.
 */
matchesRouter.post(
  '/conversations/:id/ping',
  asyncHandler(async (req, res) => {
    const m = await loadMatch(req.params.id, req.user.uid);
    const last = await db().collection(`messages/${m.id}/items`).orderBy('createdAt', 'desc').limit(1).get();
    if (last.empty || last.docs[0].data().senderId !== req.user.uid) throw new HttpError(400, 'No recent message from you', 'VALIDATION');
    const recipient = otherOf(m.users, req.user.uid);
    const ref = db().doc(`notifications/msg_${m.id}_${recipient}`);
    const existing = await ref.get();
    const count = existing.exists && existing.data().read === false ? (existing.data().data?.count ?? 1) + 1 : 1;
    await notify(recipient, 'MESSAGE', 'New message', count > 1 ? `You have ${count} new messages.` : 'You have a new message.', { matchId: m.id, count }, `msg_${m.id}_${recipient}`);
    res.json({ ok: true });
  }),
);

/** Icebreakers from interests that BOTH people allow matches to see. Hidden info is never used. */
matchesRouter.get(
  '/matches/:id/icebreakers',
  asyncHandler(async (req, res) => {
    const m = await loadMatch(req.params.id, req.user.uid);
    const [me, other] = await Promise.all([getProfile(req.user.uid), getProfile(otherOf(m.users, req.user.uid))]);
    if (!other) throw new HttpError(404, 'Match not found', 'NOT_FOUND');
    const bothShareInterests = [me, other].every((p) => canSee({ ...DEFAULT_PRIVACY, ...(p.privacy || {}) }.interests, 'MATCHED'));
    const shared = bothShareInterests ? sharedInterests(me.interests, other.interests) : [];
    res.json(await generateIcebreaker({ sharedInterests: shared }));
  }),
);
