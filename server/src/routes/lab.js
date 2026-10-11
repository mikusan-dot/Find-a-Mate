import { Router } from 'express';
import { db, FieldValue } from '../firebase.js';
import { asyncHandler, HttpError, parse, requireAuth, requireVerifiedEmail } from '../middleware/auth.js';
import { labAnswersSchema } from '../models/schemas.js';
import { LAB_DISCLAIMER, LAB_QUESTIONS, compareAnswers, validAnswers } from '../services/lab.js';
import { loadMatch } from './matches.js';
import { otherOf } from '../utils/ids.js';

export const labRouter = Router();
labRouter.use('/lab', requireAuth, requireVerifiedEmail);

labRouter.get('/lab/questions', (_req, res) => {
  res.json({
    disclaimer: LAB_DISCLAIMER,
    questions: LAB_QUESTIONS.map(({ id, dimension, prompt, options }) => ({ id, dimension, prompt, options: options.map(({ key, label }) => ({ key, label })) })),
  });
});

/** Status + results. The partner's individual answers are never returned, only the comparison. */
labRouter.get(
  '/lab/:matchId',
  asyncHandler(async (req, res) => {
    const m = await loadMatch(req.params.matchId, req.user.uid);
    const snap = await db().doc(`labs/${m.id}`).get();
    const answers = snap.exists ? snap.data().answers || {} : {};
    const partner = otherOf(m.users, req.user.uid);
    const mine = answers[req.user.uid], theirs = answers[partner];
    res.json({
      disclaimer: LAB_DISCLAIMER,
      myAnswered: !!mine,
      partnerAnswered: !!theirs,
      results: mine && theirs ? compareAnswers(mine, theirs) : null,
    });
  }),
);

labRouter.post(
  '/lab/:matchId/answers',
  asyncHandler(async (req, res) => {
    const m = await loadMatch(req.params.matchId, req.user.uid);
    const { answers } = parse(labAnswersSchema, req.body);
    if (!validAnswers(answers) || LAB_QUESTIONS.some((q) => !answers[q.id])) throw new HttpError(400, 'Answer every question with a valid option', 'VALIDATION');
    await db().doc(`labs/${m.id}`).set({ users: m.users, answers: { [req.user.uid]: answers }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    res.json({ ok: true });
  }),
);
