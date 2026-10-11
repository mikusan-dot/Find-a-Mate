// Shared enums + defaults. Keep in sync with client/src/lib/constants.js.

export const GOALS = ['FRIENDSHIP', 'STUDY_PARTNER', 'GAMING_PARTNER', 'SOMEONE_TO_TALK_TO', 'NETWORKING', 'RELATIONSHIP', 'NOT_SURE'];
export const GENDERS = ['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY'];
export const VISIBILITY = ['EVERYONE', 'COMPATIBLE', 'MATCHES', 'NOBODY'];
export const DISCOVERY_MODES = ['VISIBLE', 'LIMITED', 'INVISIBLE'];
export const REPORT_CATEGORIES = ['HARASSMENT', 'SPAM', 'FAKE_PROFILE', 'INAPPROPRIATE', 'THREATS', 'SCAMS', 'OTHER'];
export const ROLES = ['SUPER_ADMIN', 'MODERATOR', 'UNIVERSITY_ADMIN'];

export const PERSONALITY_TRAITS = ['introExtro', 'logicEmo', 'plannerSpont', 'seriousPlayful', 'quietSocial', 'indepCollab', 'riskTaking'];

export const INTERESTS = [
  'Programming', 'Gaming', 'Football', 'Cricket', 'Anime', 'Movies', 'Music', 'Photography', 'Books', 'Traveling',
  'Fitness', 'Business', 'Entrepreneurship', 'Art', 'Technology', 'Esports', 'Content creation', 'Cooking', 'Study', 'Research',
];

export const PRIVACY_FIELDS = ['name', 'photo', 'department', 'academicYear', 'age', 'university', 'interests', 'bio', 'personality'];

export const DEFAULT_PRIVACY = {
  name: 'MATCHES',
  photo: 'MATCHES',
  department: 'EVERYONE',
  academicYear: 'EVERYONE',
  age: 'COMPATIBLE',
  university: 'EVERYONE',
  interests: 'EVERYONE',
  bio: 'COMPATIBLE',
  personality: 'MATCHES',
};

// Configurable in Firestore at config/matching; these are the defaults.
export const DEFAULT_WEIGHTS = {
  personality: 0.25,
  interests: 0.2,
  lifestyle: 0.15,
  communication: 0.15,
  goals: 0.15,
  preferences: 0.1,
};

export const MATCHING = {
  COMPATIBLE_THRESHOLD: 70, // "Compatible matches only" fields unlock at/above this score
  LIMITED_THRESHOLD: 75, // "Limited" profiles are only discoverable at/above this score
  MIN_SCORE: 50, // never recommend below this
  MIN_AGE: 18,
  DEFAULT_LIMIT: 5,
  MAX_LIMIT: 10,
  POOL_SIZE: 300,
};

export const REQUIRED_FOR_COMPLETE = ['displayName', 'department', 'academicYear', 'age', 'gender', 'bio', 'interests', 'goals', 'personality', 'lifestyle', 'communication'];
