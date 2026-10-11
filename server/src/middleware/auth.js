import { auth, isReady } from '../firebase.js';

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function requireFirebase(_req, _res, next) {
  if (!isReady()) return next(new HttpError(503, 'Server is not configured with Firebase credentials', 'NOT_CONFIGURED'));
  next();
}

/** Verifies the Firebase ID token (and that it hasn't been revoked). Attaches req.user. */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Missing bearer token', 'NO_TOKEN');
    const decoded = await auth().verifyIdToken(token, true);
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified === true,
      role: decoded.role || null,
      universityId: decoded.universityId || null,
    };
    next();
  } catch (e) {
    next(e instanceof HttpError ? e : new HttpError(401, 'Invalid or expired token', 'BAD_TOKEN'));
  }
}

/** Most feature routes need a verified email address. */
export function requireVerifiedEmail(req, _res, next) {
  if (!req.user?.emailVerified) return next(new HttpError(403, 'Verify your university email first', 'EMAIL_UNVERIFIED'));
  next();
}

/** Server-side RBAC. Roles come from custom claims set via the Admin SDK only. */
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user?.role || !roles.includes(req.user.role)) return next(new HttpError(403, 'Insufficient role', 'FORBIDDEN'));
  next();
};

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Parse + validate with a zod schema; throws a 400 with readable issues. */
export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    throw new HttpError(400, msg, 'VALIDATION');
  }
  return r.data;
}
