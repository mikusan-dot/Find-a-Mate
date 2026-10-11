import { scoreCompatibility } from './matchingEngine.js';

/**
 * Pluggable AI layer.
 *
 * Hard rules:
 *  - The compatibility SCORE is computed by the deterministic engine, never by a model.
 *  - AI only writes wording (explanations / icebreakers).
 *  - AI receives the minimum data: category percentages + shared interest/goal labels.
 *    Never IDs, names, emails, phone numbers, locations, bios or messages.
 *  - Output is validated; anything that sounds certain or judgmental is discarded and the
 *    heuristic text is used instead.
 */

const BANNED = /\b(definitely|perfect|soul ?mate|guarantee[ds]?|destined|meant to be|trustworthy|untrustworthy|dangerous|mentally|disorder|diagnos\w*|good person|bad person|toxic|safe person|scientific\w*|proven)\b/i;
const LEAKY = /[@\d]{6,}|https?:\/\//i;

const GOAL_LABEL = {
  FRIENDSHIP: 'friendship',
  STUDY_PARTNER: 'a study partner',
  GAMING_PARTNER: 'a gaming partner',
  SOMEONE_TO_TALK_TO: 'someone to talk to',
  NETWORKING: 'networking',
  RELATIONSHIP: 'a relationship',
  NOT_SURE: 'staying open to what happens',
};

const list = (arr) => (arr.length <= 1 ? arr[0] || '' : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);

function providerConfigured() {
  return !!process.env.AI_API_KEY;
}

async function callProvider(system, user, timeoutMs = 8000) {
  const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 300,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(user) },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`AI provider ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.choices?.[0]?.message?.content || '{}');
}

function sanitizeLines(lines, max = 4) {
  if (!Array.isArray(lines)) return null;
  const clean = lines
    .filter((l) => typeof l === 'string')
    .map((l) => l.trim())
    .filter((l) => l.length > 5 && l.length <= 180 && !BANNED.test(l) && !LEAKY.test(l));
  return clean.length ? clean.slice(0, max) : null;
}

// ------------------------------------------------------------------ public API

/** Deterministic score + breakdown. Kept here so callers have a single entry point. */
export function calculateCompatibility(a, b, weights) {
  return scoreCompatibility(a, b, weights);
}

/**
 * @param {{score:number, breakdown:Object, sharedInterests?:string[], sharedGoals?:string[]}} input
 *   Pass sharedInterests=[] when the other person's interests aren't visible to the viewer yet.
 * @returns {Promise<{bullets:string[], source:'ai'|'heuristic'}>}
 */
export async function generateCompatibilityExplanation({ score, breakdown, sharedInterests = [], sharedGoals = [] }) {
  const fallback = heuristicExplanation({ breakdown, sharedInterests, sharedGoals });
  if (!providerConfigured()) return { bullets: fallback, source: 'heuristic' };
  try {
    const out = await callProvider(
      'You write short, cautious "why you might connect" notes for a student friendship platform. ' +
        'Use hedged language ("You may...", "It looks like..."). Never claim certainty, never call anyone good/bad/trustworthy, ' +
        'never comment on health, and never invent facts beyond the input. Reply as JSON: {"bullets": [2-4 strings under 140 chars]}.',
      { score, breakdown, sharedInterests, sharedGoals: sharedGoals.map((g) => GOAL_LABEL[g] || g) },
    );
    const bullets = sanitizeLines(out.bullets);
    return bullets ? { bullets, source: 'ai' } : { bullets: fallback, source: 'heuristic' };
  } catch {
    return { bullets: fallback, source: 'heuristic' };
  }
}

export function heuristicExplanation({ breakdown, sharedInterests = [], sharedGoals = [] }) {
  const out = [];
  if (sharedInterests.length) out.push(`You may enjoy talking about ${list(sharedInterests.slice(0, 3))}, which you both selected.`);
  if (sharedGoals.length) {
    const g = sharedGoals.filter((x) => x !== 'NOT_SURE').map((x) => GOAL_LABEL[x]).slice(0, 2);
    if (g.length) out.push(`You both said you're looking for ${list(g)}.`);
  }
  if (breakdown.communication >= 80) out.push('Your communication preferences look similar, so conversations may feel easy.');
  if (breakdown.lifestyle >= 80) out.push('Your day-to-day routines look similar, which may make planning things together simpler.');
  if (breakdown.personality >= 80) out.push('Your answers suggest a similar outlook on how you approach things.');
  if (!out.length) out.push('You may have some common ground; a short conversation is the best way to find out.');
  return out.slice(0, 4);
}

const ICEBREAKERS = {
  gaming: ['What game could you play for 100 hours and still enjoy?', 'What was the first game you were really obsessed with?'],
  programming: ['What project would you build if you had unlimited time?', 'What was the first thing you ever got working in code?'],
  football: ['Which match do you still remember vividly?', 'If you could play one game with any squad, which would it be?'],
  cricket: ['What is the best match you have ever watched?', 'Who would be in your all-time dream XI?'],
  anime: ['Which anime do you recommend to someone who has never watched any?', 'Which opening do you never skip?'],
  movies: ['What movie can you rewatch endlessly?', 'Which film surprised you the most?'],
  music: ['What song has been on repeat lately?', 'What is the best concert or gig you have been to, or want to go to?'],
  photography: ['What is a photo you took that you are proud of?', 'Do you prefer shooting people, places, or small details?'],
  books: ['What is a book you think everyone should read?', 'Which book did you finish most recently?'],
  traveling: ['Where is the next place you really want to go?', 'What is the best trip you have taken so far?'],
  fitness: ['What does a good workout day look like for you?', 'What got you into staying active?'],
  business: ['If you started a business tomorrow, what would it be?', 'What is a product you think is brilliantly designed?'],
  entrepreneurship: ['What problem around campus would you love to solve?', 'What is the boldest idea you have had?'],
  art: ['What kind of art do you enjoy making or looking at most?', 'Which artist has influenced you the most?'],
  technology: ['What technology are you most excited about right now?', 'What gadget could you not live without?'],
  esports: ['Which esports moment gave you chills?', 'Do you prefer playing or watching competitive matches?'],
  'content creation': ['What kind of content would you make if you started a channel today?', 'Who is a creator you really admire?'],
  cooking: ['What is your signature dish?', 'What is the best meal you have cooked recently?'],
  study: ['How do you usually stay focused during exam season?', 'What is your favorite place on campus to study?'],
  research: ['What topic could you read about for hours?', 'If you could research anything with no limits, what would it be?'],
};
const GENERIC = ['What is something you are looking forward to this month?', 'What is a small thing that made your week better?', 'What is your go-to way to unwind after a long day?'];

export function heuristicIcebreakers(shared = [], max = 3) {
  const out = [];
  for (const interest of shared) {
    const q = ICEBREAKERS[interest.toLowerCase()];
    if (q) out.push({ context: `You both enjoy ${interest.toLowerCase()}.`, question: q[out.length % q.length] });
  }
  for (const q of GENERIC) if (out.length < max) out.push({ context: 'A friendly opener.', question: q });
  return out.slice(0, max);
}

/**
 * @param {{sharedInterests:string[]}} input - only interests BOTH people have already agreed to expose after matching.
 */
export async function generateIcebreaker({ sharedInterests = [] }) {
  const fallback = heuristicIcebreakers(sharedInterests);
  if (!providerConfigured() || !sharedInterests.length) return { icebreakers: fallback, source: 'heuristic' };
  try {
    const out = await callProvider(
      'You write friendly, low-pressure conversation starters for two students who just matched. ' +
        'Base them ONLY on the shared interests given. Do not ask about anything personal or sensitive. ' +
        'Reply as JSON: {"icebreakers":[{"context":"short","question":"one question"}]} with 3 items.',
      { sharedInterests },
    );
    const items = Array.isArray(out.icebreakers) ? out.icebreakers : [];
    const clean = items
      .filter((i) => i && typeof i.question === 'string' && typeof i.context === 'string')
      .filter((i) => i.question.length <= 160 && !BANNED.test(i.question + i.context) && !LEAKY.test(i.question + i.context))
      .slice(0, 3)
      .map((i) => ({ context: i.context.trim(), question: i.question.trim() }));
    return clean.length ? { icebreakers: clean, source: 'ai' } : { icebreakers: fallback, source: 'heuristic' };
  } catch {
    return { icebreakers: fallback, source: 'heuristic' };
  }
}
