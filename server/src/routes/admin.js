import { Router } from 'express';
import { auth, db, FieldValue } from '../firebase.js';
import { asyncHandler, HttpError, parse, requireAuth, requireRole } from '../middleware/auth.js';
import { REPORT_CATEGORIES, ROLES } from '../config/constants.js';
import { resolveReportSchema, suspendSchema, universitySchema, weightsSchema } from '../models/schemas.js';
import { bustCache, getWeights, logAdmin, notify } from '../services/data.js';
import { alias } from '../utils/ids.js';

export const adminRouter = Router();
adminRouter.use('/admin', requireAuth, requireRole(...ROLES));

const STAFF = ['SUPER_ADMIN', 'MODERATOR'];
const SUPER = ['SUPER_ADMIN'];
const scopeUni = (req) => (req.user.role === 'UNIVERSITY_ADMIN' ? req.user.universityId : null);
const ms = (t) => t?.toMillis?.() ?? null;
const count = async (q) => (await q.count().get()).data().count;

// A UNIVERSITY_ADMIN without a university claim would otherwise see nothing sensible; fail closed.
adminRouter.use('/admin', (req, _res, next) => {
  if (req.user.role === 'UNIVERSITY_ADMIN' && !req.user.universityId) return next(new HttpError(403, 'No university assigned to this admin', 'FORBIDDEN'));
  next();
});

adminRouter.get('/admin/me', (req, res) => res.json({ role: req.user.role, universityId: req.user.universityId }));

// ---------------------------------------------------------------- stats / analytics
adminRouter.get(
  '/admin/stats',
  asyncHandler(async (req, res) => {
    const uni = scopeUni(req);
    const withUni = (q) => (uni ? q.where('universityId', '==', uni) : q);
    const [users, verified, pending, suspended, matches] = await Promise.all([
      count(withUni(db().collection('users'))),
      count(withUni(db().collection('profiles').where('verified', '==', true))),
      count(withUni(db().collection('profiles').where('verified', '==', false).where('status', '==', 'ACTIVE'))),
      count(withUni(db().collection('users').where('status', '==', 'SUSPENDED'))),
      uni ? 0 : count(db().collection('matches').where('active', '==', true)),
    ]);
    let rq = db().collection('reports').where('status', '==', 'OPEN');
    if (uni) rq = rq.where('reportedUniversityId', '==', uni);
    res.json({ users, verified, pending, suspended, activeMatches: matches, openReports: await count(rq) });
  }),
);

adminRouter.get(
  '/admin/analytics',
  asyncHandler(async (req, res) => {
    const uni = scopeUni(req);
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const day = (t) => t.toDate().toISOString().slice(0, 10);
    const bucket = (docs) => {
      const m = new Map();
      for (let i = 29; i >= 0; i--) m.set(new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10), 0);
      docs.forEach((d) => {
        const k = d.data().createdAt ? day(d.data().createdAt) : null;
        if (k && m.has(k)) m.set(k, m.get(k) + 1);
      });
      return [...m].map(([date, value]) => ({ date, value }));
    };
    let uq = db().collection('users').where('createdAt', '>=', since);
    if (uni) uq = uq.where('universityId', '==', uni);
    const [signups, matches, byCategory, unis] = await Promise.all([
      uq.limit(5000).get(),
      uni ? { docs: [] } : db().collection('matches').where('createdAt', '>=', since).limit(5000).get(),
      Promise.all(REPORT_CATEGORIES.map(async (c) => {
        let q = db().collection('reports').where('category', '==', c);
        if (uni) q = q.where('reportedUniversityId', '==', uni);
        return { category: c, value: await count(q) };
      })),
      db().collection('universities').get(),
    ]);
    const universityList = unis.docs.filter((d) => !uni || d.id === uni);
    const byUniversity = await Promise.all(universityList.map(async (d) => ({ name: d.data().shortName, value: await count(db().collection('users').where('universityId', '==', d.id)) })));
    res.json({ signups: bucket(signups.docs), matches: bucket(matches.docs), reportsByCategory: byCategory, usersByUniversity: byUniversity });
  }),
);

// ---------------------------------------------------------------- users
adminRouter.get(
  '/admin/users',
  asyncHandler(async (req, res) => {
    const uni = scopeUni(req);
    let q = db().collection('users');
    if (uni) q = q.where('universityId', '==', uni);
    else if (req.query.universityId) q = q.where('universityId', '==', String(req.query.universityId));
    if (['ACTIVE', 'SUSPENDED'].includes(req.query.status)) q = q.where('status', '==', req.query.status);
    if (req.query.emailVerified === 'true' || req.query.emailVerified === 'false') q = q.where('emailVerified', '==', req.query.emailVerified === 'true');
    q = q.orderBy('createdAt', 'desc');
    if (req.query.after) q = q.startAfter(new Date(Number(req.query.after)));
    const snap = await q.limit(25).get();
    const profiles = await Promise.all(snap.docs.map((d) => db().doc(`profiles/${d.id}`).get()));
    // Minimal fields only: no email, no student-ID data.
    const users = snap.docs.map((d, i) => {
      const p = profiles[i].exists ? profiles[i].data() : {};
      return { uid: d.id, alias: alias(d.id), displayName: p.displayName || null, department: p.department || null, universityId: d.data().universityId, status: d.data().status, emailVerified: d.data().emailVerified, createdAt: ms(d.data().createdAt) };
    });
    res.json({ users, next: users.length === 25 ? users[users.length - 1].createdAt : null });
  }),
);

/** Sensitive lookup (email). SUPER_ADMIN only, needs a stated reason, always audited. */
adminRouter.get(
  '/admin/users/:uid/sensitive',
  requireRole(...SUPER),
  asyncHandler(async (req, res) => {
    const reason = String(req.query.reason || '').trim();
    if (reason.length < 5) throw new HttpError(400, 'A reason (5+ characters) is required', 'VALIDATION');
    const u = await auth().getUser(req.params.uid).catch(() => null);
    if (!u) throw new HttpError(404, 'User not found', 'NOT_FOUND');
    await logAdmin(req.user, 'VIEW_SENSITIVE', req.params.uid, { reason, fields: ['email'] });
    res.json({ email: u.email, createdAt: u.metadata.creationTime, lastSignIn: u.metadata.lastSignInTime });
  }),
);

async function suspendUser(actor, uid, reason) {
  await auth().updateUser(uid, { disabled: true });
  await auth().revokeRefreshTokens(uid);
  const batch = db().batch();
  batch.update(db().doc(`users/${uid}`), { status: 'SUSPENDED', suspendedAt: FieldValue.serverTimestamp(), suspendReason: reason });
  batch.update(db().doc(`profiles/${uid}`), { status: 'SUSPENDED' });
  const matches = await db().collection('matches').where('users', 'array-contains', uid).where('active', '==', true).get();
  matches.docs.forEach((m) => {
    batch.update(m.ref, { active: false, endedAt: FieldValue.serverTimestamp(), endedBy: 'MODERATION' });
    batch.update(db().doc(`conversations/${m.id}`), { active: false, typing: {} });
  });
  await batch.commit();
  await logAdmin(actor, 'SUSPEND_USER', uid, { reason });
}

adminRouter.post(
  '/admin/users/:uid/suspend',
  requireRole(...STAFF),
  asyncHandler(async (req, res) => {
    const { reason } = parse(suspendSchema, req.body);
    if (req.params.uid === req.user.uid) throw new HttpError(400, 'Cannot suspend yourself', 'VALIDATION');
    await suspendUser(req.user, req.params.uid, reason);
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/admin/users/:uid/reinstate',
  requireRole(...STAFF),
  asyncHandler(async (req, res) => {
    const uid = req.params.uid;
    await auth().updateUser(uid, { disabled: false });
    const batch = db().batch();
    batch.update(db().doc(`users/${uid}`), { status: 'ACTIVE', suspendReason: FieldValue.delete() });
    batch.update(db().doc(`profiles/${uid}`), { status: 'ACTIVE' });
    await batch.commit();
    await notify(uid, 'SECURITY', 'Account reinstated', 'A moderator reinstated your account.', {});
    await logAdmin(req.user, 'REINSTATE_USER', uid);
    res.json({ ok: true });
  }),
);

adminRouter.put(
  '/admin/users/:uid/role',
  requireRole(...SUPER),
  asyncHandler(async (req, res) => {
    const { role, universityId } = req.body || {};
    if (role !== null && !ROLES.includes(role)) throw new HttpError(400, 'Invalid role', 'VALIDATION');
    if (role === 'UNIVERSITY_ADMIN' && !universityId) throw new HttpError(400, 'universityId required', 'VALIDATION');
    if (req.params.uid === req.user.uid) throw new HttpError(400, 'Cannot change your own role', 'VALIDATION');
    await auth().setCustomUserClaims(req.params.uid, role ? { role, ...(universityId ? { universityId } : {}) } : { role: null, universityId: null });
    await auth().revokeRefreshTokens(req.params.uid);
    await logAdmin(req.user, 'SET_ROLE', req.params.uid, { role, universityId: universityId || null });
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------- reports + moderation
adminRouter.get(
  '/admin/reports',
  asyncHandler(async (req, res) => {
    const uni = scopeUni(req);
    let q = db().collection('reports');
    if (uni) q = q.where('reportedUniversityId', '==', uni);
    if (['OPEN', 'RESOLVED', 'DISMISSED'].includes(req.query.status)) q = q.where('status', '==', req.query.status);
    if (REPORT_CATEGORIES.includes(req.query.category)) q = q.where('category', '==', req.query.category);
    const snap = await q.orderBy('createdAt', 'desc').limit(50).get();
    res.json({
      reports: snap.docs.map((d) => {
        const r = d.data();
        return { id: d.id, category: r.category, status: r.status, createdAt: ms(r.createdAt), reportedUid: r.reported, reportedAlias: alias(r.reported), hasEvidence: (r.evidence?.length ?? 0) > 0 };
      }),
    });
  }),
);

adminRouter.get(
  '/admin/reports/:id',
  asyncHandler(async (req, res) => {
    const snap = await db().doc(`reports/${req.params.id}`).get();
    if (!snap.exists) throw new HttpError(404, 'Report not found', 'NOT_FOUND');
    const r = snap.data();
    const uni = scopeUni(req);
    if (uni && r.reportedUniversityId !== uni) throw new HttpError(404, 'Report not found', 'NOT_FOUND');
    const [profile, openCount] = await Promise.all([
      db().doc(`profiles/${r.reported}`).get(),
      count(db().collection('reports').where('reported', '==', r.reported).where('status', '==', 'OPEN')),
    ]);
    await logAdmin(req.user, 'VIEW_REPORT', req.params.id, { evidence: (r.evidence?.length ?? 0) > 0 });
    const p = profile.exists ? profile.data() : {};
    res.json({
      report: { id: snap.id, category: r.category, details: r.details, status: r.status, createdAt: ms(r.createdAt), evidence: r.evidence || [], resolution: r.resolution || null },
      reported: { uid: r.reported, alias: alias(r.reported), displayName: p.displayName || null, department: p.department || null, status: p.status || 'DELETED', openReports: openCount },
    });
  }),
);

adminRouter.post(
  '/admin/reports/:id/resolve',
  requireRole(...STAFF),
  asyncHandler(async (req, res) => {
    const { action, note } = parse(resolveReportSchema, req.body);
    const ref = db().doc(`reports/${req.params.id}`);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, 'Report not found', 'NOT_FOUND');
    const r = snap.data();
    if (r.status !== 'OPEN') throw new HttpError(409, 'Report already handled', 'ALREADY_HANDLED');

    if (action === 'SUSPEND') await suspendUser(req.user, r.reported, note || `Report ${snap.id}: ${r.category}`);
    if (action === 'WARN') await notify(r.reported, 'SECURITY', 'Community guidelines reminder', 'A moderator reviewed a report about your account and asked you to follow the community guidelines.', {});
    await ref.update({ status: action === 'DISMISS' ? 'DISMISSED' : 'RESOLVED', resolution: { action, note, by: req.user.uid, at: new Date() }, evidence: FieldValue.delete() });
    await notify(r.reporter, 'REPORT_UPDATE', 'Report reviewed', 'A moderator has reviewed your report. Thank you for helping keep the community safe.', { reportId: snap.id });
    await logAdmin(req.user, 'RESOLVE_REPORT', snap.id, { action });
    res.json({ ok: true });
  }),
);

/** Accounts with repeated open reports, or any open THREATS report. */
adminRouter.get(
  '/admin/moderation/flagged',
  asyncHandler(async (req, res) => {
    const uni = scopeUni(req);
    let q = db().collection('reports').where('status', '==', 'OPEN');
    if (uni) q = q.where('reportedUniversityId', '==', uni);
    const snap = await q.limit(500).get();
    const g = new Map();
    snap.docs.forEach((d) => {
      const r = d.data();
      const e = g.get(r.reported) || { uid: r.reported, alias: alias(r.reported), openReports: 0, categories: new Set() };
      e.openReports += 1;
      e.categories.add(r.category);
      g.set(r.reported, e);
    });
    const flagged = [...g.values()].filter((e) => e.openReports >= 2 || e.categories.has('THREATS')).map((e) => ({ ...e, categories: [...e.categories] })).sort((a, b) => b.openReports - a.openReports);
    res.json({ flagged });
  }),
);

// ---------------------------------------------------------------- universities + config + logs
adminRouter.get(
  '/admin/universities',
  asyncHandler(async (req, res) => {
    const uni = scopeUni(req);
    const snap = await db().collection('universities').get();
    res.json({ universities: snap.docs.filter((d) => !uni || d.id === uni).map((d) => ({ id: d.id, ...d.data() })) });
  }),
);

adminRouter.post(
  '/admin/universities',
  requireRole(...SUPER),
  asyncHandler(async (req, res) => {
    const data = parse(universitySchema, req.body);
    const id = data.shortName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ref = db().doc(`universities/${id}`);
    try {
      await ref.create({ ...data, createdAt: FieldValue.serverTimestamp() });
    } catch {
      throw new HttpError(409, 'A university with this short name already exists', 'EXISTS');
    }
    bustCache();
    await logAdmin(req.user, 'CREATE_UNIVERSITY', id, { emailDomain: data.emailDomain });
    res.status(201).json({ id });
  }),
);

adminRouter.put(
  '/admin/universities/:id',
  requireRole(...SUPER),
  asyncHandler(async (req, res) => {
    const data = parse(universitySchema.partial(), req.body);
    const ref = db().doc(`universities/${req.params.id}`);
    if (!(await ref.get()).exists) throw new HttpError(404, 'University not found', 'NOT_FOUND');
    await ref.update(data);
    bustCache();
    await logAdmin(req.user, 'UPDATE_UNIVERSITY', req.params.id, { fields: Object.keys(data) });
    res.json({ ok: true });
  }),
);

adminRouter.get('/admin/config/matching', requireRole(...SUPER), asyncHandler(async (_req, res) => res.json({ weights: await getWeights() })));

adminRouter.put(
  '/admin/config/matching',
  requireRole(...SUPER),
  asyncHandler(async (req, res) => {
    const weights = parse(weightsSchema, req.body?.weights);
    await db().doc('config/matching').set({ weights, updatedBy: req.user.uid, updatedAt: FieldValue.serverTimestamp() });
    bustCache('weights');
    await logAdmin(req.user, 'UPDATE_MATCHING_WEIGHTS', 'config/matching', { weights });
    res.json({ weights: await getWeights() });
  }),
);

adminRouter.get(
  '/admin/logs',
  requireRole(...SUPER),
  asyncHandler(async (_req, res) => {
    const snap = await db().collection('adminLogs').orderBy('createdAt', 'desc').limit(100).get();
    res.json({ logs: snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: ms(d.data().createdAt) })) });
  }),
);
