// Keep in sync with server/src/config/constants.js

export const GOALS = [
  { id: 'FRIENDSHIP', label: 'Friendship', emoji: '🤝' },
  { id: 'STUDY_PARTNER', label: 'Study Partner', emoji: '📚' },
  { id: 'GAMING_PARTNER', label: 'Gaming Partner', emoji: '🎮' },
  { id: 'SOMEONE_TO_TALK_TO', label: 'Someone to Talk To', emoji: '💬' },
  { id: 'NETWORKING', label: 'Networking', emoji: '💡' },
  { id: 'RELATIONSHIP', label: 'Relationship', emoji: '❤️' },
  { id: 'NOT_SURE', label: 'Not sure yet', emoji: '🧭' },
];
export const goalLabel = (id) => GOALS.find((g) => g.id === id)?.label ?? id;
export const goalEmoji = (id) => GOALS.find((g) => g.id === id)?.emoji ?? '';

export const GENDERS = [
  { id: 'FEMALE', label: 'Female' },
  { id: 'MALE', label: 'Male' },
  { id: 'NON_BINARY', label: 'Non-binary' },
  { id: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
];

export const INTERESTS = [
  ['Programming', '💻'], ['Gaming', '🎮'], ['Football', '⚽'], ['Cricket', '🏏'], ['Anime', '🌸'], ['Movies', '🎬'], ['Music', '🎵'],
  ['Photography', '📷'], ['Books', '📖'], ['Traveling', '✈️'], ['Fitness', '💪'], ['Business', '📈'], ['Entrepreneurship', '🚀'], ['Art', '🎨'],
  ['Technology', '🔧'], ['Esports', '🏆'], ['Content creation', '🎥'], ['Cooking', '🍳'], ['Study', '📚'], ['Research', '🔬'],
];
export const interestEmoji = (name) => INTERESTS.find(([n]) => n.toLowerCase() === String(name).toLowerCase())?.[1] ?? '✨';

export const TRAITS = [
  { id: 'introExtro', left: 'Introvert', right: 'Extrovert' },
  { id: 'logicEmo', left: 'Logical', right: 'Emotional' },
  { id: 'plannerSpont', left: 'Planner', right: 'Spontaneous' },
  { id: 'seriousPlayful', left: 'Serious', right: 'Playful' },
  { id: 'quietSocial', left: 'Quiet', right: 'Social' },
  { id: 'indepCollab', left: 'Independent', right: 'Collaborative' },
  { id: 'riskTaking', left: 'Risk-averse', right: 'Risk-taking' },
];

export const VISIBILITY = [
  { id: 'EVERYONE', label: 'Everyone' },
  { id: 'COMPATIBLE', label: 'Compatible matches' },
  { id: 'MATCHES', label: 'Mutual matches only' },
  { id: 'NOBODY', label: 'Nobody' },
];

export const PRIVACY_FIELDS = [
  { id: 'name', label: 'Name' },
  { id: 'photo', label: 'Profile photo' },
  { id: 'department', label: 'Department' },
  { id: 'academicYear', label: 'Academic year' },
  { id: 'age', label: 'Age' },
  { id: 'university', label: 'University' },
  { id: 'interests', label: 'Interests' },
  { id: 'bio', label: 'Bio' },
  { id: 'personality', label: 'Personality information' },
];

export const DISCOVERY = [
  { id: 'VISIBLE', label: 'Visible', desc: 'Appear in recommendations for people who match your preferences.' },
  { id: 'LIMITED', label: 'Limited', desc: 'Only shown to highly compatible people (75%+).' },
  { id: 'INVISIBLE', label: 'Invisible', desc: 'Not shown in discovery. Existing conversations keep working.' },
];

export const REPORT_CATEGORIES = [
  ['HARASSMENT', 'Harassment'], ['SPAM', 'Spam'], ['FAKE_PROFILE', 'Fake profile'], ['INAPPROPRIATE', 'Inappropriate content'],
  ['THREATS', 'Threats'], ['SCAMS', 'Scams'], ['OTHER', 'Other'],
];

export const BREAKDOWN_LABELS = {
  personality: 'Personality', interests: 'Interests', lifestyle: 'Lifestyle', communication: 'Communication', goals: 'Goals', preferences: 'Preferences',
};

export const EMOJIS = ['😀', '😂', '😊', '😍', '🤔', '😎', '🥳', '👍', '🙌', '🔥', '💡', '🎮', '💻', '📚', '🎵', '⚽', '☕', '🍕', '🌟', '❤️', '😅', '🙏', '👀', '🎉'];

export const ordinal = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
