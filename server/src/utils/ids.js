import crypto from 'node:crypto';

/** Deterministic id for an unordered pair of uids (match / conversation / compat result). */
export const pairId = (a, b) => [a, b].sort().join('_');

/** Directed id (likes, passes, blocks). */
export const dirId = (from, to) => `${from}_${to}`;

/** Short anonymous alias like "Profile A7F2". Derived from uid so it is stable but not reversible. */
export function alias(uid) {
  const h = crypto.createHash('sha256').update(`alias:${uid}`).digest('hex').slice(0, 4).toUpperCase();
  return `Profile ${h}`;
}

export const otherOf = (users, uid) => users.find((u) => u !== uid);
