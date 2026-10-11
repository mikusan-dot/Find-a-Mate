import 'dotenv/config';
import crypto from 'node:crypto';
import { initFirebase, db, auth, FieldValue } from './firebase.js';
import { DEFAULT_PRIVACY, DEFAULT_WEIGHTS, GOALS, INTERESTS, PERSONALITY_TRAITS } from './config/constants.js';

if (!initFirebase()) {
  console.error('Set FIREBASE_* variables in server/.env first.');
  process.exit(1);
}

const UNIVERSITIES = [
  { id: 'diu', name: 'Daffodil International University', shortName: 'DIU', emailDomain: 'diu.edu.bd', departments: ['CSE', 'SWE', 'EEE', 'BBA', 'Architecture', 'English', 'Law'] },
  { id: 'bracu', name: 'BRAC University', shortName: 'BRACU', emailDomain: 'bracu.ac.bd', departments: ['CSE', 'EEE', 'BBA', 'Architecture', 'Pharmacy'] },
  { id: 'nsu', name: 'North South University', shortName: 'NSU', emailDomain: 'northsouth.edu', departments: ['CSE', 'EEE', 'BBA', 'Economics', 'Microbiology'] },
  { id: 'iub', name: 'Independent University, Bangladesh', shortName: 'IUB', emailDomain: 'iub.edu.bd', departments: ['CSE', 'EEE', 'BBA', 'Media & Communication'] },
];

async function seedCore() {
  for (const u of UNIVERSITIES) {
    await db().doc(`universities/${u.id}`).set({ ...u, verificationMethod: 'EMAIL_DOMAIN', active: true, logo: null, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await db().doc('config/matching').set({ weights: DEFAULT_WEIGHTS, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  console.log(`Seeded ${UNIVERSITIES.length} universities and matching weights.`);
}

// ---------------------------------------------------------------- opt-in demo data (always demo:true, sign-in disabled)
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

async function seedDemo(count = 12) {
  const names = ['Anika', 'Rafi', 'Nusrat', 'Tanvir', 'Mim', 'Sakib', 'Tasnia', 'Arif', 'Lamia', 'Fahim', 'Samia', 'Nabil', 'Orin', 'Jubayer', 'Ritu'];
  const genders = ['FEMALE', 'MALE', 'NON_BINARY'];
  const r = rng(42);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const sample = (arr, n) => [...arr].sort(() => r() - 0.5).slice(0, n);
  const slider = () => Math.round(r() * 100);

  for (let i = 0; i < count; i++) {
    const uni = pick(UNIVERSITIES);
    const uid = `demo_${i}`;
    const age = 19 + Math.floor(r() * 6);
    const email = `demo${i}@${uni.emailDomain}`;
    await auth().createUser({ uid, email, password: crypto.randomBytes(24).toString('base64url'), emailVerified: true, disabled: true }).catch(() => {});
    await db().doc(`users/${uid}`).set({ universityId: uni.id, status: 'ACTIVE', emailVerified: true, demo: true, notifPrefs: { matches: true, messages: true, interests: true, reports: true }, createdAt: FieldValue.serverTimestamp() });
    await db().doc(`profiles/${uid}`).set({
      demo: true,
      universityId: uni.id,
      displayName: `${names[i % names.length]} (demo)`,
      photoURL: null,
      department: pick(uni.departments),
      academicYear: 1 + Math.floor(r() * 4),
      age,
      gender: pick(genders),
      bio: 'Demo profile for local development.',
      personality: Object.fromEntries(PERSONALITY_TRAITS.map((t) => [t, slider()])),
      interests: sample(INTERESTS, 4 + Math.floor(r() * 3)),
      lifestyle: { sleep: pick(['EARLY', 'NORMAL', 'NIGHT_OWL']), studyHabit: pick(['SOLO', 'GROUP', 'MIXED']), socialActivity: slider(), weekend: pick(['HOME', 'OUTDOOR', 'MIXED']), indoorOutdoor: slider(), workStudyBalance: slider(), smokes: false, drinks: false },
      communication: { frequency: pick(['LOW', 'MEDIUM', 'HIGH']), depth: pick(['LIGHT', 'MIXED', 'DEEP']), medium: pick(['TEXT', 'VOICE', 'IN_PERSON', 'MIXED']), groupVsOne: pick(['GROUP', 'ONE_ON_ONE', 'BOTH']) },
      goals: sample(GOALS.filter((g) => g !== 'RELATIONSHIP' || r() > 0.5), 1 + Math.floor(r() * 3)),
      preferences: { ageMin: 18, ageMax: 30, genders: [], university: 'ANY', department: 'ANY' },
      dealBreakers: { smoking: false, alcohol: false, verySocial: false, differentCommFrequency: false },
      privacy: DEFAULT_PRIVACY,
      discovery: 'VISIBLE',
      verified: true,
      status: 'ACTIVE',
      onboardingComplete: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  console.log(`Seeded ${count} demo profiles (demo:true, sign-in disabled).`);
}

await seedCore();
if (process.env.ALLOW_DEMO_DATA === 'true') await seedDemo();
else console.log('Demo data skipped (set ALLOW_DEMO_DATA=true to opt in).');
