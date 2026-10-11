import { Router } from 'express';
import { db, FieldValue } from '../firebase.js';
import { asyncHandler, HttpError, parse, requireAuth, requireVerifiedEmail } from '../middleware/auth.js';
import { notifPrefsSchema, privacySchema, profileSchema } from '../models/schemas.js';
import { profileCompleteness } from '../services/matchingEngine.js';
import { getProfile, getUniversity, notify } from '../services/data.js';

export const profileRouter = Router();
profileRouter.use(['/me', '/profile', '/settings', '/security'], requireAuth);

const PHOTO_HOSTS = ['firebasestorage.googleapis.com', 'storage.googleapis.com'];

/** Account + the caller's OWN full profile (the only place private fields are returned). */
profileRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const [userSnap, profile] = await Promise.all([db().doc(`users/${req.user.uid}`).get(), getProfile(req.user.uid)]);
    if (!userSnap.exists) throw new HttpError(404, 'Account not found', 'NO_ACCOUNT');
    const user = userSnap.data();
    const university = await getUniversity(user.universityId);
    res.json({
      uid: req.user.uid,
      email: req.user.email,
      emailVerified: req.user.emailVerified,
      role: req.user.role,
      user: { status: user.status, universityId: user.universityId, notifPrefs: user.notifPrefs },
      university: university ? { id: university.id, name: university.name, shortName: university.shortName, departments: university.departments || [] } : null,
      profile,
      completeness: profileCompleteness(profile || {}),
    });
  }),
);

profileRouter.put(
  '/profile',
  requireVerifiedEmail,
  asyncHandler(async (req, res) => {
    const patch = parse(profileSchema, req.body);
    if (patch.photoURL) {
      const host = new URL(patch.photoURL).hostname;
      if (!PHOTO_HOSTS.includes(host)) throw new HttpError(400, 'Photo must be uploaded through the app', 'BAD_PHOTO');
      if (!patch.photoURL.includes(`avatars%2F${req.user.uid}%2F`) && !patch.photoURL.includes(`avatars/${req.user.uid}/`)) {
        throw new HttpError(400, 'Photo must belong to your account', 'BAD_PHOTO');
      }
    }
    const current = await getProfile(req.user.uid);
    if (!current) throw new HttpError(404, 'Profile not found', 'NO_PROFILE');
    const merged = { ...current, ...patch };
    const c = profileCompleteness(merged);
    await db().doc(`profiles/${req.user.uid}`).set({ ...patch, onboardingComplete: c.onboardingComplete, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    res.json({ profile: { ...merged, onboardingComplete: c.onboardingComplete }, completeness: c });
  }),
);

profileRouter.put(
  '/profile/privacy',
  requireVerifiedEmail,
  asyncHandler(async (req, res) => {
    const patch = parse(privacySchema, req.body);
    const update = { updatedAt: FieldValue.serverTimestamp() };
    if (patch.discovery) update.discovery = patch.discovery;
    if (patch.privacy) for (const [k, v] of Object.entries(patch.privacy)) update[`privacy.${k}`] = v;
    await db().doc(`profiles/${req.user.uid}`).update(update);
    res.json({ profile: await getProfile(req.user.uid) });
  }),
);

profileRouter.put(
  '/settings/notifications',
  asyncHandler(async (req, res) => {
    const patch = parse(notifPrefsSchema, req.body);
    const update = Object.fromEntries(Object.entries(patch).map(([k, v]) => [`notifPrefs.${k}`, v]));
    if (Object.keys(update).length) await db().doc(`users/${req.user.uid}`).update(update);
    const u = await db().doc(`users/${req.user.uid}`).get();
    res.json({ notifPrefs: u.data().notifPrefs });
  }),
);

/** Client reports a completed sensitive action (e.g. password change) so the user gets a security notice. */
profileRouter.post(
  '/security/event',
  asyncHandler(async (req, res) => {
    const kind = req.body?.kind;
    const messages = { PASSWORD_CHANGED: 'Your password was changed. If this was not you, contact support and reset your password.' };
    if (!messages[kind]) throw new HttpError(400, 'Unknown event', 'VALIDATION');
    await notify(req.user.uid, 'SECURITY', 'Security notice', messages[kind], { kind });
    res.json({ ok: true });
  }),
);
