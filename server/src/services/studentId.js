import crypto from 'node:crypto';

/** student ID -> normalize -> HMAC. Raw IDs are never persisted; the hex digest is the uniqueness key. */
export function normalizeStudentId(raw) {
  return String(raw).normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashStudentId(universityId, raw, pepper = process.env.STUDENT_ID_PEPPER) {
  if (!pepper || pepper.length < 16) throw new Error('STUDENT_ID_PEPPER must be set (>= 16 chars)');
  const normalized = normalizeStudentId(raw);
  if (normalized.length < 3) throw new Error('Invalid student ID');
  return crypto.createHmac('sha256', pepper).update(`${universityId}:${normalized}`).digest('hex');
}

/** Email must belong to the university's domain (or a subdomain of it). */
export function emailMatchesDomain(email, domain) {
  const at = email.lastIndexOf('@');
  if (at < 1) return false;
  const host = email.slice(at + 1).toLowerCase();
  const d = domain.toLowerCase();
  return host === d || host.endsWith(`.${d}`);
}
