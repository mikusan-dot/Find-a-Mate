import { DEFAULT_PRIVACY, MATCHING } from '../config/constants.js';
import { alias } from '../utils/ids.js';

/** Relationship of the viewer to the profile owner, used to resolve per-field visibility. */
export function relationOf({ matched = false, score = 0 } = {}) {
  if (matched) return 'MATCHED';
  return score >= MATCHING.COMPATIBLE_THRESHOLD ? 'COMPATIBLE' : 'EVERYONE';
}

export function canSee(level, relation) {
  switch (level) {
    case 'EVERYONE': return true;
    case 'COMPATIBLE': return relation === 'COMPATIBLE' || relation === 'MATCHED';
    case 'MATCHES': return relation === 'MATCHED';
    default: return false; // NOBODY (or unknown values fail closed)
  }
}

/**
 * Builds what another user is allowed to see. Student ID, email, phone, address and
 * verification details are never part of a profile document view, and are not copied here.
 * Always visible: the anonymous alias, the "Verified Student" badge and connection goals
 * (goals are the point of discovery). Everything else follows the owner's privacy settings.
 */
export function publicView(profile, relation, university = null) {
  const priv = { ...DEFAULT_PRIVACY, ...(profile.privacy || {}) };
  const show = (field) => canSee(priv[field], relation);
  const hidden = [];
  const pick = (field, value) => {
    if (show(field)) return value ?? null;
    hidden.push(field);
    return null;
  };
  return {
    uid: profile.uid,
    alias: alias(profile.uid),
    verified: true,
    displayName: show('name') ? profile.displayName : alias(profile.uid),
    photoURL: pick('photo', profile.photoURL),
    department: pick('department', profile.department),
    academicYear: pick('academicYear', profile.academicYear),
    age: pick('age', profile.age),
    university: pick('university', university ? { name: university.name, shortName: university.shortName } : null),
    interests: pick('interests', profile.interests) ?? [],
    bio: pick('bio', profile.bio),
    personality: pick('personality', profile.personality),
    goals: profile.goals || [],
    hidden,
    isAnonymous: !show('name'),
  };
}

/** Interests two users may reference in an explanation/icebreaker: only if BOTH exposed them to the viewer. */
export function interestsVisibleToViewer(profile, relation) {
  const priv = { ...DEFAULT_PRIVACY, ...(profile.privacy || {}) };
  return canSee(priv.interests, relation);
}
