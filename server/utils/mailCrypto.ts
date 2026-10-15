import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/** A random six-digit one-time code. */
export const newCode = () => String(randomInt(0, 10 ** 6)).padStart(6, '0');

const hmac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('hex');

/** Keyed hash of a code, bound to its member and purpose: a copy of the database alone can't be searched for the code. */
export const hashCode = (secret: string, memberId: number, purpose: string, code: string) => hmac(secret, `code:${memberId}:${purpose}:${code}`);

/** Constant-time comparison of two hex digests. */
export function sameHash(a: string, b: string) {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** `payload.signature` for a link in an email ("not me", later unsubscribe); the payload is readable, not secret. */
export const signToken = (secret: string, payload: string) => `${Buffer.from(payload).toString('base64url')}.${hmac(secret, `token:${payload}`)}`;

/** The payload of a token made by `signToken`, or null when it is malformed or was not signed with this secret. */
export function verifyToken(secret: string, token: unknown) {
  if (typeof token !== 'string') return null;
  const [body, sig, ...rest] = token.split('.');
  if (!body || !sig || rest.length) return null;
  const payload = Buffer.from(body, 'base64url').toString();
  return sameHash(sig, hmac(secret, `token:${payload}`)) ? payload : null;
}
