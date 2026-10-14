import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { and, eq, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';

const scryptAsync = promisify(scrypt) as (pin: string, salt: Buffer, len: number) => Promise<Buffer>;
const KEY_LEN = 32;

/** `salt:hash` (hex). scrypt is slow on purpose, so a leaked database can't be brute-forced cheaply. */
export async function hashPin(pin: string) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${(await scryptAsync(pin, salt, KEY_LEN)).toString('hex')}`;
}

export async function pinMatches(pin: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = await scryptAsync(pin, Buffer.from(salt, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Refuses a malformed or guessable PIN with a 400 (`pinFormat`, `pinWeak`). */
export function requirePin(v: unknown) {
  const problem = pinProblem(v);
  if (problem) fail(400, problem === 'format' ? 'pinFormat' : 'pinWeak');
  return v as string;
}

/** A random PIN that passes `pinProblem`, for an organizer reset. */
export function randomPin() {
  for (;;) {
    const pin = String(randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, '0');
    if (!pinProblem(pin)) return pin;
  }
}

/**
 * Checks a member's PIN. A guess is counted before the PIN is checked, in one atomic UPDATE, so parallel guesses can't slip
 * past the limit: after PIN_MAX_FAILS wrong PINs the name is locked for PIN_LOCK_MS. An unknown name, a name without a PIN
 * and a wrong PIN all answer `pinWrong`, so the roster can't be probed. A good PIN clears the count (and, with
 * `unarchive`, brings an archived member back to the roster).
 */
export async function verifyPin(memberId: number, given: unknown, unarchive = false) {
  const { members } = schema;
  const pin = clean(given, 20);
  if (pinProblem(pin) === 'format') fail(401, 'pinWrong');
  const atLimit = sql`${members.pinFails} >= ${PIN_MAX_FAILS - 1}`;
  const [row] = await useDb()
    .update(members)
    .set({
      pinFails: sql`case when ${atLimit} then 0 else ${members.pinFails} + 1 end`,
      pinLockedUntil: sql`case when ${atLimit} then now() + make_interval(secs => ${PIN_LOCK_MS / 1000}) else ${members.pinLockedUntil} end`,
    })
    .where(and(eq(members.id, memberId), isNotNull(members.pinHash), or(isNull(members.pinLockedUntil), lte(members.pinLockedUntil, sql`now()`))))
    .returning({ id: members.id, name: members.name, pinHash: members.pinHash });
  if (!row) {
    const [m] = await useDb().select({ until: members.pinLockedUntil }).from(members).where(eq(members.id, memberId));
    if (m?.until && m.until > new Date()) fail(429, 'pinLocked');
    fail(401, 'pinWrong');
  }
  if (!(await pinMatches(pin, row.pinHash!))) fail(401, 'pinWrong');
  await useDb()
    .update(members)
    .set({ pinFails: 0, pinLockedUntil: null, ...(unarchive && { archivedAt: null }) })
    .where(eq(members.id, memberId));
  return { id: row.id, name: row.name };
}

/**
 * For actions that would lock the real owner out (changing the PIN, signing out other devices): a member with a PIN must
 * present it again, so a stolen session or sign-in link is not enough. A member without a PIN has nothing to present.
 */
export async function requireCurrentPin(memberId: number, given: unknown) {
  const [m] = await useDb().select({ has: isNotNull(schema.members.pinHash).mapWith(Boolean) }).from(schema.members).where(eq(schema.members.id, memberId));
  if (m?.has) await verifyPin(memberId, given);
}
