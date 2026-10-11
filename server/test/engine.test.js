import test from 'node:test';
import assert from 'node:assert/strict';
import { passesHardFilters, scoreCompatibility, rankCandidates, normalizeWeights, profileCompleteness, interestScore } from '../src/services/matchingEngine.js';
import { hashStudentId, normalizeStudentId, emailMatchesDomain } from '../src/services/studentId.js';
import { publicView, canSee, relationOf } from '../src/services/privacy.js';
import { heuristicExplanation, heuristicIcebreakers } from '../src/services/aiMatchingService.js';
import { compareAnswers, LAB_QUESTIONS } from '../src/services/lab.js';
import { DEFAULT_PRIVACY } from '../src/config/constants.js';

const base = (uid, over = {}) => ({
  uid, universityId: 'diu', displayName: uid, department: 'CSE', academicYear: 3, age: 21, gender: 'FEMALE', bio: 'hello there friend',
  verified: true, status: 'ACTIVE', onboardingComplete: true, discovery: 'VISIBLE',
  personality: { introExtro: 50, logicEmo: 50, plannerSpont: 50, seriousPlayful: 50, quietSocial: 50, indepCollab: 50, riskTaking: 50 },
  interests: ['Programming', 'Gaming', 'Music'],
  lifestyle: { sleep: 'NORMAL', studyHabit: 'MIXED', socialActivity: 50, weekend: 'MIXED', indoorOutdoor: 50, workStudyBalance: 50, smokes: false, drinks: false },
  communication: { frequency: 'MEDIUM', depth: 'MIXED', medium: 'TEXT', groupVsOne: 'BOTH' },
  goals: ['FRIENDSHIP'],
  preferences: { ageMin: 18, ageMax: 30, genders: [], university: 'ANY', department: 'ANY' },
  dealBreakers: { smoking: false, alcohol: false, verySocial: false, differentCommFrequency: false },
  privacy: { ...DEFAULT_PRIVACY },
  ...over,
});

test('near-identical profiles score very high, opposites score low', () => {
  const a = base('a');
  assert.ok(scoreCompatibility(a, base('b')).score >= 95);
  const far = base('c', {
    personality: Object.fromEntries(Object.keys(a.personality).map((k) => [k, 0])),
    interests: ['Cooking'], goals: ['NETWORKING'],
    lifestyle: { sleep: 'NIGHT_OWL', studyHabit: 'SOLO', socialActivity: 100, weekend: 'OUTDOOR', indoorOutdoor: 100, workStudyBalance: 0, smokes: false, drinks: false },
    communication: { frequency: 'HIGH', depth: 'DEEP', medium: 'IN_PERSON', groupVsOne: 'GROUP' },
  });
  const p = base('p', { personality: Object.fromEntries(Object.keys(a.personality).map((k) => [k, 100])) });
  assert.ok(scoreCompatibility(p, far).score < 40);
});

test('score is deterministic and bounded 0-100 with a breakdown', () => {
  const r1 = scoreCompatibility(base('a'), base('b', { interests: ['Programming', 'Art'] }));
  const r2 = scoreCompatibility(base('a'), base('b', { interests: ['Programming', 'Art'] }));
  assert.deepEqual(r1, r2);
  assert.ok(r1.score >= 0 && r1.score <= 100);
  for (const k of ['personality', 'interests', 'lifestyle', 'communication', 'goals', 'preferences']) assert.ok(r1.breakdown[k] >= 0 && r1.breakdown[k] <= 100);
});

test('weights are configurable and normalized', () => {
  const w = normalizeWeights({ personality: 1, interests: 1, lifestyle: 1, communication: 1, goals: 1, preferences: 1 });
  assert.ok(Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const a = base('a'), b = base('b', { interests: ['Cooking'] });
  const onlyInterests = scoreCompatibility(a, b, { personality: 0, interests: 1, lifestyle: 0, communication: 0, goals: 0, preferences: 0 });
  assert.equal(onlyInterests.score, 0);
});

test('hard filters: block, seen, invisible, unverified, age, gender, university, deal-breakers, goals', () => {
  const v = base('v');
  assert.ok(passesHardFilters(v, base('x')).ok);
  assert.equal(passesHardFilters(v, base('x'), { blocked: new Set(['x']) }).reason, 'blocked');
  assert.equal(passesHardFilters(v, base('x'), { seen: new Set(['x']) }).reason, 'seen');
  assert.equal(passesHardFilters(v, base('x', { discovery: 'INVISIBLE' })).reason, 'invisible');
  assert.equal(passesHardFilters(v, base('x', { verified: false })).reason, 'unverified');
  assert.equal(passesHardFilters(v, base('x', { status: 'SUSPENDED' })).reason, 'inactive');
  assert.equal(passesHardFilters(v, base('x', { age: 17 })).reason, 'age');
  assert.equal(passesHardFilters(v, base('x', { age: 40 })).reason, 'age-pref');
  assert.equal(passesHardFilters(base('v', { preferences: { ...v.preferences, genders: ['MALE'] } }), base('x')).reason, 'gender-pref');
  // preferences apply in both directions
  assert.equal(passesHardFilters(v, base('x', { preferences: { ...v.preferences, genders: ['MALE'] } })).reason, 'gender-pref');
  assert.equal(passesHardFilters(base('v', { preferences: { ...v.preferences, university: 'SAME' } }), base('x', { universityId: 'nsu' })).reason, 'university-pref');
  assert.equal(passesHardFilters(base('v', { dealBreakers: { ...v.dealBreakers, smoking: true } }), base('x', { lifestyle: { ...v.lifestyle, smokes: true } })).reason, 'deal-breaker');
  assert.equal(passesHardFilters(base('v', { goals: ['RELATIONSHIP'] }), base('x', { goals: ['STUDY_PARTNER'] })).reason, 'connection-type');
  assert.ok(passesHardFilters(base('v', { goals: ['NOT_SURE'] }), base('x', { goals: ['STUDY_PARTNER'] })).ok);
  assert.equal(passesHardFilters(v, v).reason, 'self');
});

test('rankCandidates sorts desc, applies LIMITED threshold and the limit', () => {
  const v = base('v');
  const near = base('near');
  const mid = base('mid', { interests: ['Programming'], personality: Object.fromEntries(Object.keys(v.personality).map((k) => [k, 80])) });
  const limitedLow = base('limitedLow', { discovery: 'LIMITED', interests: ['Cooking'], goals: ['FRIENDSHIP', 'NETWORKING'], personality: Object.fromEntries(Object.keys(v.personality).map((k) => [k, 5])) });
  const ranked = rankCandidates(v, [mid, near, limitedLow, base('inv', { discovery: 'INVISIBLE' })]);
  assert.equal(ranked[0].candidate.uid, 'near');
  assert.ok(ranked.every((r, i, a) => i === 0 || a[i - 1].score >= r.score));
  assert.ok(!ranked.some((r) => r.candidate.uid === 'limitedLow'));
  assert.ok(!ranked.some((r) => r.candidate.uid === 'inv'));
  assert.equal(rankCandidates(v, [base('a'), base('b'), base('c')], {}, undefined, 2).length, 2);
});

test('interest score ignores case', () => {
  assert.equal(interestScore(['programming'], ['Programming']), 1);
  assert.equal(interestScore([], ['x']), 0);
});

test('profile completeness lists what is missing', () => {
  const c = profileCompleteness({ displayName: 'x' });
  assert.ok(c.percent < 20 && !c.onboardingComplete && c.missing.includes('Short bio'));
  assert.equal(profileCompleteness({ ...base('a'), photoURL: 'https://x' }).percent, 100);
});

test('student ID hashing: normalized, per-university, never raw', () => {
  const pepper = 'x'.repeat(32);
  assert.equal(normalizeStudentId(' 213-15-1234 '), '213151234');
  assert.equal(hashStudentId('diu', '213-15-1234', pepper), hashStudentId('diu', '213151234', pepper));
  assert.notEqual(hashStudentId('diu', '213151234', pepper), hashStudentId('nsu', '213151234', pepper));
  assert.ok(!hashStudentId('diu', '213151234', pepper).includes('213151234'));
  assert.throws(() => hashStudentId('diu', '213151234', 'short'));
});

test('email domain check accepts the domain and subdomains only', () => {
  assert.ok(emailMatchesDomain('a@diu.edu.bd', 'diu.edu.bd'));
  assert.ok(emailMatchesDomain('a@student.diu.edu.bd', 'diu.edu.bd'));
  assert.ok(!emailMatchesDomain('a@evildiu.edu.bd', 'diu.edu.bd'));
  assert.ok(!emailMatchesDomain('a@gmail.com', 'diu.edu.bd'));
  assert.ok(!emailMatchesDomain('diu.edu.bd', 'diu.edu.bd'));
});

test('privacy: hidden fields are removed, identifiers never leak, NOBODY is respected', () => {
  const p = base('u1', { email: 'secret@diu.edu.bd', studentId: '123', photoURL: 'https://img', privacy: { ...DEFAULT_PRIVACY, department: 'NOBODY' } });
  const v = publicView(p, 'EVERYONE', { name: 'Daffodil', shortName: 'DIU' });
  assert.equal(v.photoURL, null);
  assert.ok(v.displayName.startsWith('Profile '));
  assert.equal(v.department, null);
  assert.ok(v.hidden.includes('department'));
  assert.ok(!JSON.stringify(v).includes('secret@') && !('studentId' in v) && !('email' in v));
  const m = publicView(p, 'MATCHED', null);
  assert.equal(m.displayName, 'u1');
  assert.equal(m.department, null); // NOBODY applies even to matches
  assert.equal(canSee('COMPATIBLE', relationOf({ score: 80 })), true);
  assert.equal(canSee('COMPATIBLE', relationOf({ score: 60 })), false);
  assert.equal(canSee('weird', 'MATCHED'), false);
});

test('AI heuristics use cautious language and never claim certainty', () => {
  const lines = heuristicExplanation({ breakdown: { communication: 90, lifestyle: 90, personality: 90 }, sharedInterests: ['Gaming', 'Programming'], sharedGoals: ['FRIENDSHIP'] });
  const text = lines.join(' ');
  assert.match(text, /may/i);
  assert.doesNotMatch(text, /definitely|perfect|guarantee|soulmate/i);
  assert.ok(heuristicIcebreakers(['Gaming']).length >= 1);
  assert.ok(heuristicIcebreakers([]).length >= 1);
});

test('compatibility lab compares only shared answers', () => {
  const same = Object.fromEntries(LAB_QUESTIONS.map((q) => [q.id, 'A']));
  const diff = Object.fromEntries(LAB_QUESTIONS.map((q) => [q.id, 'D']));
  assert.deepEqual(compareAnswers(same, same), { communication: 100, lifestyle: 100, overall: 100 });
  assert.equal(compareAnswers(same, diff).overall, 0);
  assert.equal(compareAnswers({}, same).overall, null);
});
