import { Router } from 'express';
import { db, FieldValue } from '../firebase.js';
import { asyncHandler, HttpError, requireAuth, requireVerifiedEmail } from '../middleware/auth.js';
import { MATCHING } from '../config/constants.js';
import { passesHardFilters, rankCandidates, scoreCompatibility } from '../services/matchingEngine.js';
import { buildRecommendation } from '../services/recommendations.js';
import { getBlockedSet, getProfile, getSeenSet, getWeights, notify } from '../services/data.js';
import { dirId, pairId } from '../utils/ids.js';

export const discoveryRouter = Router();
discoveryRouter.use('/discover', requireAuth, requireVerifiedEmail);

async function requireReadyViewer(uid) {
  const viewer = await getProfile(uid);
  if (!viewer) throw new HttpError(404, 'Profile not found', 'NO_PROFILE');
  if (!viewer.verified) throw new HttpError(403, 'Verification pending', 'UNVERIFIED');
  if (viewer.status !== 'ACTIVE') throw new HttpError(403, 'Account is not active', 'INACTIVE');
  if (!viewer.onboardingComplete) throw new HttpError(409, 'Complete your profile to see recommendations', 'ONBOARDING_INCOMPLETE');
  return viewer;
}

/** Curated, small set of recommendations (quality over quantity). */
discoveryRouter.get(
  '/discover',
  asyncHandler(async (req, res) => {
    const viewer = await requireReadyViewer(req.user.uid);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || MATCHING.DEFAULT_LIMIT, 1), MATCHING.MAX_LIMIT);
    const [blocked, seen, weights] = await Promise.all([getBlockedSet(viewer.uid), getSeenSet(viewer.uid), getWeights()]);

    let q = db().collection('profiles').where('verified', '==', true).where('status', '==', 'ACTIVE');
    if (viewer.preferences?.university === 'SAME') q = q.where('universityId', '==', viewer.universityId);
    const snap = await q.orderBy('updatedAt', 'desc').limit(MATCHING.POOL_SIZE).get(); // recently active first
    const pool = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));

    const ranked = rankCandidates(viewer, pool, { blocked, seen }, weights, limit);
    const recommendations = await Promise.all(ranked.map((r) => buildRecommendation(viewer, r.candidate, r)));
    res.json({ recommendations, generatedAt: new Date().toISOString() });
  }),
);

/** View one profile. Never leaks existence: ineligible profiles are a plain 404. */
discoveryRouter.get(
  '/discover/:uid',
  asyncHandler(async (req, res) => {
    const viewer = await requireReadyViewer(req.user.uid);
    const candidate = await getProfile(req.params.uid);
    if (!candidate) throw new HttpError(404, 'Profile not found', 'NOT_FOUND');

    const matchSnap = await db().doc(`matches/${pairId(viewer.uid, candidate.uid)}`).get();
    const matched = matchSnap.exists && matchSnap.data().active === true;
    if (!matched) {
      const blocked = await getBlockedSet(viewer.uid);
      if (!passesHardFilters(viewer, candidate, { blocked }).ok) throw new HttpError(404, 'Profile not found', 'NOT_FOUND');
    }
    const { score, breakdown } = scoreCompatibility(viewer, candidate, await getWeights());
    if (!matched && candidate.discovery === 'LIMITED' && score < MATCHING.LIMITED_THRESHOLD) throw new HttpError(404, 'Profile not found', 'NOT_FOUND');
    res.json({ profile: await buildRecommendation(viewer, candidate, { score, breakdown, matched }), matched });
  }),
);

/**
 * "Interested". A conversation is only created when BOTH sides have expressed interest.
 * The other person is never told who liked them until the match exists.
 */
discoveryRouter.post(
  '/discover/:uid/like',
  asyncHandler(async (req, res) => {
    const viewer = await requireReadyViewer(req.user.uid);
    const targetUid = req.params.uid;
    if (targetUid === viewer.uid) throw new HttpError(400, 'Cannot like yourself', 'VALIDATION');
    const candidate = await getProfile(targetUid);
    if (!candidate) throw new HttpError(404, 'Profile not found', 'NOT_FOUND');

    const blocked = await getBlockedSet(viewer.uid);
    const eligible = passesHardFilters(viewer, candidate, { blocked });
    if (!eligible.ok) throw new HttpError(404, 'Profile not found', 'NOT_FOUND');

    const likeRef = db().doc(`likes/${dirId(viewer.uid, targetUid)}`);
    const passRef = db().doc(`passes/${dirId(viewer.uid, targetUid)}`);
    const reverseRef = db().doc(`likes/${dirId(targetUid, viewer.uid)}`);
    const id = pairId(viewer.uid, targetUid);
    const matchRef = db().doc(`matches/${id}`);
    const convRef = db().doc(`conversations/${id}`);
    const { score } = scoreCompatibility(viewer, candidate, await getWeights());

    const result = await db().runTransaction(async (tx) => {
      const [like, pass, reverse, existing] = await Promise.all([tx.get(likeRef), tx.get(passRef), tx.get(reverseRef), tx.get(matchRef)]);
      if (pass.exists) throw new HttpError(409, 'You already passed on this profile', 'ALREADY_PASSED');
      if (existing.exists && existing.data().active) return { matched: true, matchId: id, created: false };
      if (!like.exists) tx.set(likeRef, { from: viewer.uid, to: targetUid, createdAt: FieldValue.serverTimestamp() });
      if (!reverse.exists) return { matched: false, created: false, firstLike: !like.exists };
      const now = FieldValue.serverTimestamp();
      tx.set(matchRef, { users: [viewer.uid, targetUid].sort(), active: true, conversationId: id, score, createdAt: now });
      tx.set(convRef, { participants: [viewer.uid, targetUid].sort(), active: true, typing: {}, lastMessage: null, createdAt: now, updatedAt: now });
      return { matched: true, matchId: id, created: true };
    });

    if (result.created) {
      await Promise.all([viewer.uid, targetUid].map((u) => notify(u, 'MATCH', "It's a match!", 'You both showed interest. You can now start a conversation.', { matchId: id }, `match_${id}_${u}`)));
    } else if (!result.matched && result.firstLike) {
      await notify(targetUid, 'INTEREST', 'Someone is interested', 'A compatible student showed interest in connecting. Keep an eye on your recommendations.', {}, `interest_${viewer.uid}_${targetUid}`);
    }
    res.json({ matched: result.matched, matchId: result.matched ? id : null });
  }),
);

discoveryRouter.post(
  '/discover/:uid/pass',
  asyncHandler(async (req, res) => {
    const uid = req.user.uid;
    if (req.params.uid === uid) throw new HttpError(400, 'Invalid target', 'VALIDATION');
    const exists = await db().doc(`profiles/${req.params.uid}`).get();
    if (!exists.exists) throw new HttpError(404, 'Profile not found', 'NOT_FOUND');
    await db().doc(`passes/${dirId(uid, req.params.uid)}`).set({ from: uid, to: req.params.uid, createdAt: FieldValue.serverTimestamp() });
    res.json({ ok: true });
  }),
);
