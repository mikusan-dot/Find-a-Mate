import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { requireFirebase } from '../middleware/auth.js';
import { authRouter } from './auth.js';
import { profileRouter } from './profile.js';
import { discoveryRouter } from './discovery.js';
import { matchesRouter } from './matches.js';
import { safetyRouter } from './safety.js';
import { labRouter } from './lab.js';
import { accountRouter } from './account.js';
import { adminRouter } from './admin.js';

export const api = Router();
api.use(requireFirebase);

const json429 = { error: 'Too many requests, please slow down.', code: 'RATE_LIMITED' };

// Stable per-user key without verifying the token twice: hash of the bearer token, else the client IP.
const tokenKey = (req) => {
  const h = req.headers.authorization;
  return h ? crypto.createHash('sha256').update(h).digest('hex').slice(0, 32) : ipKeyGenerator(req.ip);
};

const limiter = (opts) => rateLimit({ standardHeaders: true, legacyHeaders: false, message: json429, ...opts });

// Brute-force / account-farming protection on unauthenticated writes.
api.use('/auth/register', limiter({ windowMs: 60 * 60 * 1000, limit: 10, keyGenerator: (req) => ipKeyGenerator(req.ip) }));
// Abuse-prone authenticated actions.
api.use(['/discover/:uid/like', '/discover/:uid/pass'], limiter({ windowMs: 60 * 1000, limit: 30, keyGenerator: tokenKey }));
api.use('/conversations/:id/ping', limiter({ windowMs: 60 * 1000, limit: 30, keyGenerator: tokenKey }));
api.use('/reports', limiter({ windowMs: 60 * 60 * 1000, limit: 20, keyGenerator: tokenKey }));
api.use('/account', limiter({ windowMs: 60 * 60 * 1000, limit: 5, keyGenerator: tokenKey }));

// Public routes first, then routers that each guard only their own path prefixes.
api.use(authRouter);
api.use(profileRouter);
api.use(discoveryRouter);
api.use(matchesRouter);
api.use(safetyRouter);
api.use(labRouter);
api.use(accountRouter);
api.use(adminRouter);
