import { Router } from 'express';
import { auth, bucket, db } from '../firebase.js';
import { asyncHandler, HttpError, requireAuth } from '../middleware/auth.js';
import { deleteConversationData, deleteQuery } from '../services/data.js';

export const accountRouter = Router();
accountRouter.use('/account', requireAuth);

/**
 * Permanently deletes the account.
 *   removed:  profile, account doc, matches, conversations + messages, likes, passes, blocks,
 *             notifications, compatibility results, lab answers, profile photos, login
 *   kept:     reports that involve the user (safety records, minimal fields), and the one-way student-ID
 *             hash ONLY if the account was suspended (so a banned student can't simply re-register).
 */
accountRouter.delete(
  '/account',
  asyncHandler(async (req, res) => {
    if (req.body?.confirm !== 'DELETE') throw new HttpError(400, 'Send {"confirm":"DELETE"} to confirm', 'VALIDATION');
    const uid = req.user.uid;
    const userSnap = await db().doc(`users/${uid}`).get();
    const suspended = userSnap.exists && userSnap.data().status === 'SUSPENDED';

    const matches = await db().collection('matches').where('users', 'array-contains', uid).get();
    for (const m of matches.docs) {
      await deleteConversationData(m.id);
      await db().doc(`labs/${m.id}`).delete().catch(() => {});
      await m.ref.delete();
    }
    await Promise.all([
      deleteQuery(db().collection('likes').where('from', '==', uid)),
      deleteQuery(db().collection('likes').where('to', '==', uid)),
      deleteQuery(db().collection('passes').where('from', '==', uid)),
      deleteQuery(db().collection('passes').where('to', '==', uid)),
      deleteQuery(db().collection('blocks').where('blocker', '==', uid)),
      deleteQuery(db().collection('blocks').where('blocked', '==', uid)),
      deleteQuery(db().collection('notifications').where('uid', '==', uid)),
      deleteQuery(db().collection('compatibilityResults').where('users', 'array-contains', uid)),
    ]);

    const hashes = await db().collection('studentIds').where('uid', '==', uid).get();
    for (const h of hashes.docs) {
      if (suspended) await h.ref.update({ uid: null, retained: 'SUSPENDED_ACCOUNT' });
      else await h.ref.delete();
    }

    await bucket().deleteFiles({ prefix: `avatars/${uid}/` }).catch(() => {});
    await db().doc(`profiles/${uid}`).delete();
    await db().doc(`users/${uid}`).delete();
    await auth().deleteUser(uid).catch(() => {});
    res.json({ ok: true });
  }),
);
