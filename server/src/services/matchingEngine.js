import { DEFAULT_WEIGHTS, MATCHING, PERSONALITY_TRAITS } from '../config/constants.js';

// Deterministic matching: hard filters first, then weighted scoring. No AI involved here.

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const pct = (n) => Math.round(clamp01(n) * 100);
const ORD = { LOW: 0, MEDIUM: 1, HIGH: 2, LIGHT: 0, MIXED: 1, DEEP: 2 };

/** Normalize weights so they always sum to 1. */
export function normalizeWeights(w = DEFAULT_WEIGHTS) {
  const merged = { ...DEFAULT_WEIGHTS, ...w };
  const sum = Object.values(merged).reduce((a, b) => a + (Number(b) || 0), 0) || 1;
  return Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, (Number(v) || 0) / sum]));
}

// ---------------------------------------------------------------- hard filters

const wantsGender = (prefs, gender) => !prefs?.genders?.length || prefs.genders.includes(gender);
const inAgeRange = (prefs, age) => age >= (prefs?.ageMin ?? 18) && age <= (prefs?.ageMax ?? 80);
const goalsOverlap = (a, b) => a.includes('NOT_SURE') || b.includes('NOT_SURE') || a.some((g) => b.includes(g));

function universityOk(prefs, a, b) {
  const same = a.universityId === b.universityId;
  return !prefs || prefs.university === 'ANY' || (prefs.university === 'SAME' ? same : !same);
}
function departmentOk(prefs, a, b) {
  const same = (a.department || '').toLowerCase() === (b.department || '').toLowerCase();
  return !prefs || prefs.department === 'ANY' || (prefs.department === 'SAME' ? same : !same);
}

/** Does `candidate` trip any deal-breaker that `viewer` set? (user-defined preferences only) */
export function tripsDealBreaker(viewer, candidate) {
  const d = viewer.dealBreakers || {};
  const l = candidate.lifestyle || {};
  if (d.smoking && l.smokes) return 'smoking';
  if (d.alcohol && l.drinks) return 'alcohol';
  if (d.verySocial && (l.socialActivity ?? 0) >= 80) return 'verySocial';
  if (d.differentCommFrequency) {
    const x = ORD[viewer.communication?.frequency], y = ORD[candidate.communication?.frequency];
    if (x !== undefined && y !== undefined && Math.abs(x - y) >= 2) return 'differentCommFrequency';
  }
  return null;
}

/**
 * Returns { ok, reason }. `ctx` = { blocked:Set<uid>, seen:Set<uid> } for the viewer.
 * Preferences are applied in BOTH directions so nobody is shown to someone they excluded.
 */
export function passesHardFilters(viewer, candidate, ctx = {}) {
  const no = (reason) => ({ ok: false, reason });
  if (!viewer || !candidate) return no('missing');
  if (viewer.uid === candidate.uid) return no('self');
  for (const p of [viewer, candidate]) {
    if (!p.verified) return no('unverified');
    if (p.status !== 'ACTIVE') return no('inactive');
    if (!p.onboardingComplete) return no('incomplete');
    if ((p.age ?? 0) < MATCHING.MIN_AGE) return no('age');
  }
  if (candidate.discovery === 'INVISIBLE') return no('invisible');
  if (ctx.blocked?.has(candidate.uid)) return no('blocked');
  if (ctx.seen?.has(candidate.uid)) return no('seen');
  if (!inAgeRange(viewer.preferences, candidate.age) || !inAgeRange(candidate.preferences, viewer.age)) return no('age-pref');
  if (!wantsGender(viewer.preferences, candidate.gender) || !wantsGender(candidate.preferences, viewer.gender)) return no('gender-pref');
  if (!universityOk(viewer.preferences, viewer, candidate) || !universityOk(candidate.preferences, candidate, viewer)) return no('university-pref');
  if (!departmentOk(viewer.preferences, viewer, candidate) || !departmentOk(candidate.preferences, candidate, viewer)) return no('department-pref');
  if (!goalsOverlap(viewer.goals || [], candidate.goals || [])) return no('connection-type');
  if (tripsDealBreaker(viewer, candidate) || tripsDealBreaker(candidate, viewer)) return no('deal-breaker');
  return { ok: true };
}

// ---------------------------------------------------------------- component scores (0..1)

export function personalityScore(a, b) {
  const diffs = PERSONALITY_TRAITS.map((t) => {
    const x = a?.[t], y = b?.[t];
    return Number.isFinite(x) && Number.isFinite(y) ? 1 - Math.abs(x - y) / 100 : null;
  }).filter((v) => v !== null);
  return diffs.length ? diffs.reduce((s, v) => s + v, 0) / diffs.length : 0;
}

export function sharedInterests(a = [], b = []) {
  const set = new Set(b.map((i) => i.toLowerCase()));
  return a.filter((i) => set.has(i.toLowerCase()));
}

export function interestScore(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const overlap = sharedInterests(a, b).length;
  const union = new Set([...a, ...b].map((i) => i.toLowerCase())).size;
  const jaccard = overlap / union;
  const coverage = overlap / Math.min(a.length, b.length);
  return clamp01(0.4 * jaccard + 0.6 * coverage);
}

const sameCat = (x, y, adj = 0.5) => (x === undefined || y === undefined ? 0.5 : x === y ? 1 : adj);
const near = (x, y) => (Number.isFinite(x) && Number.isFinite(y) ? 1 - Math.abs(x - y) / 100 : 0.5);

export function lifestyleScore(a = {}, b = {}) {
  const sleepAdj = (x, y) => (x === 'NORMAL' || y === 'NORMAL' ? 0.6 : 0.1);
  const parts = [
    a.sleep === b.sleep ? 1 : sleepAdj(a.sleep, b.sleep),
    sameCat(a.studyHabit, b.studyHabit, a.studyHabit === 'MIXED' || b.studyHabit === 'MIXED' ? 0.7 : 0.2),
    near(a.socialActivity, b.socialActivity),
    sameCat(a.weekend, b.weekend, a.weekend === 'MIXED' || b.weekend === 'MIXED' ? 0.7 : 0.2),
    near(a.indoorOutdoor, b.indoorOutdoor),
    near(a.workStudyBalance, b.workStudyBalance),
  ];
  return parts.reduce((s, v) => s + v, 0) / parts.length;
}

export function communicationScore(a = {}, b = {}) {
  const ordSim = (x, y) => (ORD[x] === undefined || ORD[y] === undefined ? 0.5 : 1 - Math.abs(ORD[x] - ORD[y]) / 2);
  const parts = [
    ordSim(a.frequency, b.frequency),
    ordSim(a.depth, b.depth),
    sameCat(a.medium, b.medium, a.medium === 'MIXED' || b.medium === 'MIXED' ? 0.75 : 0.35),
    sameCat(a.groupVsOne, b.groupVsOne, a.groupVsOne === 'BOTH' || b.groupVsOne === 'BOTH' ? 0.8 : 0.3),
  ];
  return parts.reduce((s, v) => s + v, 0) / parts.length;
}

export function goalsScore(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const concrete = (x) => x.filter((g) => g !== 'NOT_SURE');
  const ca = concrete(a), cb = concrete(b);
  if (!ca.length || !cb.length) return 0.6; // "Not sure yet" is compatible with anything, without overclaiming
  const overlap = ca.filter((g) => cb.includes(g)).length;
  if (!overlap) return 0;
  return clamp01(0.5 + 0.5 * (overlap / Math.min(ca.length, cb.length)));
}

/** How well each person's age sits inside the other's preferred range (closer to center = better). */
export function preferenceScore(a, b) {
  const fit = (prefs, age) => {
    if (!prefs || !Number.isFinite(age)) return 0.5;
    const span = Math.max(1, prefs.ageMax - prefs.ageMin);
    const center = (prefs.ageMin + prefs.ageMax) / 2;
    return clamp01(1 - Math.abs(age - center) / (span / 2 + 3));
  };
  const same = (a.universityId === b.universityId ? 1 : 0.7) * 0.5 + 0.5;
  return (fit(a.preferences, b.age) + fit(b.preferences, a.age) + same) / 3;
}

// ---------------------------------------------------------------- overall

/** Weighted 0-100 compatibility with per-category breakdown. Pure and deterministic. */
export function scoreCompatibility(a, b, weights = DEFAULT_WEIGHTS) {
  const w = normalizeWeights(weights);
  const raw = {
    personality: personalityScore(a.personality, b.personality),
    interests: interestScore(a.interests, b.interests),
    lifestyle: lifestyleScore(a.lifestyle, b.lifestyle),
    communication: communicationScore(a.communication, b.communication),
    goals: goalsScore(a.goals, b.goals),
    preferences: preferenceScore(a, b),
  };
  const total = Object.keys(raw).reduce((s, k) => s + raw[k] * w[k], 0);
  return {
    score: pct(total),
    breakdown: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, pct(v)])),
  };
}

/**
 * Rank candidates for a viewer.
 * `pool` are full profile objects (server-side only). Returns [{ candidate, score, breakdown }] sorted desc.
 * LIMITED profiles only surface at/above LIMITED_THRESHOLD; nothing below MIN_SCORE is ever returned.
 */
export function rankCandidates(viewer, pool, ctx = {}, weights = DEFAULT_WEIGHTS, limit = MATCHING.DEFAULT_LIMIT) {
  const out = [];
  for (const candidate of pool) {
    if (!passesHardFilters(viewer, candidate, ctx).ok) continue;
    const { score, breakdown } = scoreCompatibility(viewer, candidate, weights);
    if (score < MATCHING.MIN_SCORE) continue;
    if (candidate.discovery === 'LIMITED' && score < MATCHING.LIMITED_THRESHOLD) continue;
    out.push({ candidate, score, breakdown });
  }
  out.sort((x, y) => y.score - x.score || x.candidate.uid.localeCompare(y.candidate.uid));
  return out.slice(0, Math.min(limit, MATCHING.MAX_LIMIT));
}

/** Profile completeness 0-100 plus a human list of what's missing. */
export function profileCompleteness(p = {}) {
  const checks = [
    ['Display name', !!p.displayName],
    ['Department', !!p.department],
    ['Academic year', !!p.academicYear],
    ['Age', !!p.age],
    ['Gender', !!p.gender],
    ['Short bio', !!p.bio && p.bio.length >= 10],
    ['At least 3 interests', (p.interests?.length ?? 0) >= 3],
    ['Connection goals', (p.goals?.length ?? 0) >= 1],
    ['Personality sliders', !!p.personality && PERSONALITY_TRAITS.every((t) => Number.isFinite(p.personality[t]))],
    ['Lifestyle answers', !!p.lifestyle?.sleep],
    ['Communication preferences', !!p.communication?.frequency],
    ['Profile photo', !!p.photoURL],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([label]) => label);
  const required = ['Display name', 'Department', 'Academic year', 'Age', 'Gender', 'Short bio', 'At least 3 interests', 'Connection goals', 'Personality sliders', 'Lifestyle answers', 'Communication preferences'];
  return {
    percent: Math.round(((checks.length - missing.length) / checks.length) * 100),
    missing,
    onboardingComplete: required.every((r) => !missing.includes(r)),
  };
}
