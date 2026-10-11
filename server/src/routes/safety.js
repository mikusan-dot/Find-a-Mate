import { Router } from 'express';
import { db, FieldValue } from '../firebase.js';
import { asyncHandler, HttpError, parse, requireAuth, requireVerifiedEmail } from '../middleware/auth.js';
import { reportSchema } from '../models/schemas.js';
import { alias, dirId, pairId } from '../utils/ids.js';

export const safetyRouter = Router();
safetyRouter.use(['/blocks', '/reports'], requireAuth, requireVerifiedEmail);

/** Block: both users disappear from each other's discovery, and any match/conversation is disabled. */
safetyRouter.post(
  '/blocks/:uid',
  asyncHandler(async (req, res) => {
    const me = req.user.uid, them = req.params.uid;
    if (me === them) throw new HttpError(400, 'Cannot block yourself', 'VALIDATION');
    const target = await db().doc(`users/${them}`).get();
    if (!target.exists) throw new HttpError(404, 'User not found', 'NOT_FOUND');
    const id = pairId(me, them);
    const [matchSnap, convSnap] = await Promise.all([db().doc(`matches/${id}`).get(), db().doc(`conversations/${id}`).get()]);
    const batch = db().batch();
    batch.set(db().doc(`blocks/${dirId(me, them)}`), { blocker: me, blocked: them, createdAt: FieldValue.serverTimestamp() });
    // Only touch documents that exist; merging into a missing doc would create a stub without users/participants.
    if (matchSnap.exists) batch.update(matchSnap.ref, { active: false, endedAt: FieldValue.serverTimestamp(), endedBy: me });
    if (convSnap.exists) batch.update(convSnap.ref, { active: false, typing: {}, updatedAt: FieldValue.serverTimestamp() });
    batch.delete(db().doc(`likes/${dirId(me, them)}`));
    batch.delete(db().doc(`likes/${dirId(them, me)}`));
    batch.set(db().doc(`passes/${dirId(me, them)}`), { from: me, to: them, createdAt: FieldValue.serverTimestamp() });
    batch.set(db().doc(`passes/${dirId(them, me)}`), { from: them, to: me, createdAt: FieldValue.serverTimestamp() });
    await batch.commit();
    res.json({ ok: true });
  }),
);

safetyRouter.delete(
  '/blocks/:uid',
  asyncHandler(async (req, res) => {
    await db().doc(`blocks/${dirId(req.user.uid, req.params.uid)}`).delete();
    res.json({ ok: true });
  }),
);

/** Only anonymous aliases are listed. */
safetyRouter.get(
  '/blocks',
  asyncHandler(async (req, res) => {
    const snap = await db().collection('blocks').where('blocker', '==', req.user.uid).limit(200).get();
    res.json({ blocks: snap.docs.map((d) => ({ uid: d.data().blocked, alias: alias(d.data().blocked), createdAt: d.data().createdAt?.toMillis?.() ?? null })) });
  }),
);

/**
 * Report. Message evidence is only attached if the reporter explicitly opts in, and is limited to the
 * last 10 messages of a conversation the reporter is part of. Admins have no other way to read chats.
 */
safetyRouter.post(
  '/reports',
  asyncHandler(async (req, res) => {
    const body = parse(reportSchema, req.body);
    const me = req.user.uid;
    if (body.reportedUid === me) throw new HttpError(400, 'Cannot report yourself', 'VALIDATION');
    const target = await db().doc(`profiles/${body.reportedUid}`).get();
    if (!target.exists) throw new HttpError(404, 'User not found', 'NOT_FOUND');

    const recent = await db().collection('reports').where('reporter', '==', me).where('createdAt', '>', new Date(Date.now() - 24 * 3600 * 1000)).get();
    if (recent.size >= 10) throw new HttpError(429, 'Too many reports today', 'RATE_LIMITED');

    let evidence = [];
    let conversationId = null;
    if (body.includeRecentMessages) {
      const convId = pairId(me, body.reportedUid);
      const conv = await db().doc(`conversations/${convId}`).get();
      if (conv.exists && conv.data().participants.includes(me)) {
        conversationId = convId;
        const msgs = await db().collection(`messages/${convId}/items`).orderBy('createdAt', 'desc').limit(10).get();
        evidence = msgs.docs
          .map((d) => d.data())
          .filter((m) => !m.deleted)
          .reverse()
          .map((m) => ({ from: m.senderId === me ? 'reporter' : 'reported', text: String(m.text).slice(0, 500), at: m.createdAt?.toMillis?.() ?? null }));
      }
    }

    const ref = await db().collection('reports').add({
      reporter: me,
      reported: body.reportedUid,
      reportedUniversityId: target.data().universityId || null,
      category: body.category,
      details: body.details,
      conversationId,
      evidence,
      status: 'OPEN',
      createdAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({ id: ref.id, message: 'Thanks. Our moderators will review this report.' });
  }),
);
