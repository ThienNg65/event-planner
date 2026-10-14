import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

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
