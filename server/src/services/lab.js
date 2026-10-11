// Compatibility Lab: a light, fun mini-quiz for matched pairs. NOT a psychological test.
// Each option has a position on a 0..3 axis; closer positions = more alike.

export const LAB_DISCLAIMER = 'Just for fun. This is not a scientific or psychological test.';

export const LAB_QUESTIONS = [
  { id: 'c1', dimension: 'communication', prompt: 'A friend sends you a long message. You usually…', options: [
    { key: 'A', label: 'Reply within minutes', pos: 0 }, { key: 'B', label: 'Reply within a few hours', pos: 1 }, { key: 'C', label: 'Reply when I have time to think', pos: 2 }, { key: 'D', label: 'Switch to a call', pos: 3 } ] },
  { id: 'c2', dimension: 'communication', prompt: 'Your ideal chat is…', options: [
    { key: 'A', label: 'Memes and quick jokes', pos: 0 }, { key: 'B', label: 'Daily life updates', pos: 1 }, { key: 'C', label: 'Ideas and projects', pos: 2 }, { key: 'D', label: 'Deep late-night talks', pos: 3 } ] },
  { id: 'c3', dimension: 'communication', prompt: 'If we disagree, I prefer to…', options: [
    { key: 'A', label: 'Laugh it off', pos: 0 }, { key: 'B', label: 'Talk it through right away', pos: 1 }, { key: 'C', label: 'Take some space first', pos: 2 }, { key: 'D', label: 'Write down my thoughts', pos: 3 } ] },
  { id: 'c4', dimension: 'communication', prompt: 'How often is "staying in touch"?', options: [
    { key: 'A', label: 'Every day', pos: 0 }, { key: 'B', label: 'A few times a week', pos: 1 }, { key: 'C', label: 'Weekly', pos: 2 }, { key: 'D', label: 'Whenever something comes up', pos: 3 } ] },
  { id: 'l1', dimension: 'lifestyle', prompt: 'You have a free weekend. What would you rather do?', options: [
    { key: 'A', label: 'Stay home', pos: 0 }, { key: 'B', label: 'Work on a project', pos: 1 }, { key: 'C', label: 'Go outside', pos: 2 }, { key: 'D', label: 'Travel', pos: 3 } ] },
  { id: 'l2', dimension: 'lifestyle', prompt: 'Your best study setup is…', options: [
    { key: 'A', label: 'Alone in my room', pos: 0 }, { key: 'B', label: 'Quiet library', pos: 1 }, { key: 'C', label: 'Cafe with a friend', pos: 2 }, { key: 'D', label: 'Group session', pos: 3 } ] },
  { id: 'l3', dimension: 'lifestyle', prompt: 'When do you feel most productive?', options: [
    { key: 'A', label: 'Early morning', pos: 0 }, { key: 'B', label: 'Afternoon', pos: 1 }, { key: 'C', label: 'Evening', pos: 2 }, { key: 'D', label: 'Late at night', pos: 3 } ] },
  { id: 'l4', dimension: 'lifestyle', prompt: 'A perfect evening is…', options: [
    { key: 'A', label: 'A movie at home', pos: 0 }, { key: 'B', label: 'Gaming or a hobby', pos: 1 }, { key: 'C', label: 'Dinner with a few friends', pos: 2 }, { key: 'D', label: 'A big social event', pos: 3 } ] },
];

const byId = new Map(LAB_QUESTIONS.map((q) => [q.id, q]));

export function validAnswers(answers) {
  return Object.entries(answers).every(([qid, key]) => byId.get(qid)?.options.some((o) => o.key === key));
}

const posOf = (qid, key) => byId.get(qid)?.options.find((o) => o.key === key)?.pos;

/** Returns { communication, lifestyle, overall } as 0-100, using only questions both answered. */
export function compareAnswers(a, b) {
  const dims = { communication: [], lifestyle: [] };
  for (const q of LAB_QUESTIONS) {
    const pa = posOf(q.id, a[q.id]), pb = posOf(q.id, b[q.id]);
    if (pa === undefined || pb === undefined) continue;
    dims[q.dimension].push(1 - Math.abs(pa - pb) / 3);
  }
  const avg = (xs) => (xs.length ? Math.round((xs.reduce((s, v) => s + v, 0) / xs.length) * 100) : null);
  const communication = avg(dims.communication), lifestyle = avg(dims.lifestyle);
  const parts = [communication, lifestyle].filter((v) => v !== null);
  return { communication, lifestyle, overall: parts.length ? Math.round(parts.reduce((s, v) => s + v, 0) / parts.length) : null };
}
