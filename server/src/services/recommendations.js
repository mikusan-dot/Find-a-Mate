import { db, FieldValue } from '../firebase.js';
import { pairId } from '../utils/ids.js';
import { generateCompatibilityExplanation } from './aiMatchingService.js';
import { sharedInterests } from './matchingEngine.js';
import { interestsVisibleToViewer, publicView, relationOf } from './privacy.js';
import { getUniversity } from './data.js';

const TTL_MS = 24 * 3600 * 1000;
const millis = (t) => (t?.toMillis ? t.toMillis() : 0);

/**
 * Explanation for one viewer about one pair. Cached per viewer in compatibilityResults/{pair}
 * (server-only collection). Cache invalidates when either profile changed or after 24h.
 */
async function explanationFor(viewer, candidate, { score, breakdown, interestsOk }) {
  const id = pairId(viewer.uid, candidate.uid);
  const ref = db().doc(`compatibilityResults/${id}`);
  const snap = await ref.get();
  const cached = snap.exists ? snap.data().explanations?.[viewer.uid] : null;
  const newest = Math.max(millis(viewer.updatedAt), millis(candidate.updatedAt));
  const fresh = cached && Date.now() - millis(cached.at) < TTL_MS && millis(cached.at) >= newest && cached.interestsOk === interestsOk;
  if (fresh) return { bullets: cached.bullets, source: cached.source };

  const shared = interestsOk ? sharedInterests(viewer.interests, candidate.interests) : [];
  const sharedGoals = (viewer.goals || []).filter((g) => (candidate.goals || []).includes(g));
  const out = await generateCompatibilityExplanation({ score, breakdown, sharedInterests: shared, sharedGoals });
  await ref.set(
    {
      users: [viewer.uid, candidate.uid].sort(),
      score,
      breakdown,
      explanations: { [viewer.uid]: { ...out, interestsOk, at: new Date() } },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return out;
}

/** One recommendation card: privacy-filtered profile + score + breakdown + cautious explanation. */
export async function buildRecommendation(viewer, candidate, { score, breakdown, matched = false }) {
  const relation = relationOf({ matched, score });
  const university = await getUniversity(candidate.universityId);
  const view = publicView(candidate, relation, university);
  const interestsOk = interestsVisibleToViewer(candidate, relation);
  const explanation = await explanationFor(viewer, candidate, { score, breakdown, interestsOk });
  return {
    ...view,
    score,
    breakdown,
    sharedInterests: interestsOk ? sharedInterests(viewer.interests, candidate.interests) : [],
    sharedGoals: (viewer.goals || []).filter((g) => (candidate.goals || []).includes(g)),
    explanation,
  };
}
