import { Router } from 'express';
import { auth, db, FieldValue } from '../firebase.js';
import { asyncHandler, HttpError, parse, requireAuth } from '../middleware/auth.js';
import { registerSchema } from '../models/schemas.js';
import { emailMatchesDomain, hashStudentId } from '../services/studentId.js';
import { getUniversity } from '../services/data.js';
import { DEFAULT_PRIVACY } from '../config/constants.js';

export const authRouter = Router();

/** Public registry of universities that can be selected at sign-up (no secrets inside). */
authRouter.get(
  '/universities',
  asyncHandler(async (_req, res) => {
    const snap = await db().collection('universities').where('active', '==', true).get();
    res.json({
      universities: snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .map(({ id, name, shortName, emailDomain, logo, departments }) => ({ id, name, shortName, emailDomain, logo: logo || null, departments: departments || [] }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  }),
);

/**
 * Registration:
 *   student ID -> normalize -> HMAC -> reserve (create fails if it already exists) -> create Auth user -> write docs
 * The raw student ID is never stored or logged.
 */
authRouter.post(
  '/auth/register',
  asyncHandler(async (req, res) => {
    const body = parse(registerSchema, req.body);
    const uni = await getUniversity(body.universityId);
    if (!uni || !uni.active) throw new HttpError(400, 'Unknown or inactive university', 'BAD_UNIVERSITY');
    if (!emailMatchesDomain(body.email, uni.emailDomain)) {
      throw new HttpError(400, `Use your @${uni.emailDomain} university email address`, 'EMAIL_DOMAIN');
    }

    const hash = hashStudentId(uni.id, body.studentId);
    const uid = db().collection('users').doc().id;
    const reservation = db().doc(`studentIds/${hash}`);

    try {
      await reservation.create({ uid, universityId: uni.id, createdAt: FieldValue.serverTimestamp() });
    } catch (e) {
      if (e.code === 6 || /already exists/i.test(e.message)) throw new HttpError(409, 'An account already exists for this student ID', 'STUDENT_ID_TAKEN');
      throw e;
    }

    try {
      await auth().createUser({ uid, email: body.email, password: body.password, emailVerified: false, disabled: false });
    } catch (e) {
      await reservation.delete().catch(() => {});
      if (e.code === 'auth/email-already-exists') throw new HttpError(409, 'An account already exists for this email', 'EMAIL_TAKEN');
      if (e.code === 'auth/invalid-password') throw new HttpError(400, 'Password is too weak', 'WEAK_PASSWORD');
      throw e;
    }

    const now = FieldValue.serverTimestamp();
    const batch = db().batch();
    batch.set(db().doc(`users/${uid}`), {
      universityId: uni.id,
      status: 'ACTIVE',
      emailVerified: false,
      notifPrefs: { matches: true, messages: true, interests: true, reports: true },
      createdAt: now,
    });
    batch.set(db().doc(`profiles/${uid}`), {
      universityId: uni.id,
      gender: body.gender,
      age: body.age,
      goals: body.connectionTypes,
      verified: false,
      status: 'ACTIVE',
      onboardingComplete: false,
      discovery: 'VISIBLE',
      privacy: DEFAULT_PRIVACY,
      preferences: { ageMin: Math.max(18, body.age - 5), ageMax: Math.min(80, body.age + 8), genders: [], university: 'ANY', department: 'ANY' },
      dealBreakers: { smoking: false, alcohol: false, verySocial: false, differentCommFrequency: false },
      interests: [],
      createdAt: now,
      updatedAt: now,
    });
    await batch.commit();

    res.status(201).json({ ok: true, message: 'Account created. Sign in and verify your university email to continue.' });
  }),
);

/** After the user clicks the verification link, promote the account to "Verified Student". */
authRouter.post(
  '/auth/sync-verification',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user.emailVerified) throw new HttpError(400, 'Email is not verified yet', 'EMAIL_UNVERIFIED');
    const userRef = db().doc(`users/${req.user.uid}`);
    const user = await userRef.get();
    if (!user.exists) throw new HttpError(404, 'Account not found', 'NO_ACCOUNT');
    if (user.data().status === 'SUSPENDED') throw new HttpError(403, 'Account suspended', 'SUSPENDED');
    const uni = await getUniversity(user.data().universityId);
    if (!uni || !uni.active || !emailMatchesDomain(req.user.email, uni.emailDomain)) {
      throw new HttpError(403, 'Email does not match the university domain', 'EMAIL_DOMAIN');
    }
    const batch = db().batch();
    batch.update(userRef, { emailVerified: true, verifiedAt: FieldValue.serverTimestamp() });
    batch.update(db().doc(`profiles/${req.user.uid}`), { verified: true, updatedAt: FieldValue.serverTimestamp() });
    await batch.commit();
    res.json({ verified: true });
  }),
);
