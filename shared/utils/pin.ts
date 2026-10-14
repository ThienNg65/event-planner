/** A sign-in PIN is exactly this many digits. */
export const PIN_LENGTH = 6;
/** Wrong guesses allowed before the name is locked. */
export const PIN_MAX_FAILS = 5;
/** How long a name stays locked after too many wrong guesses. */
export const PIN_LOCK_MS = 15 * 60_000;

/** Why a PIN is refused (an i18n key under `pin.`), or null when it is fine: six digits, not all alike, not a run. */
export function pinProblem(pin: unknown): 'format' | 'weak' | null {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) return 'format';
  const steps = [...pin].slice(1).map((c, i) => Number(c) - Number(pin[i]));
  const same = steps.every((s) => s === 0);
  const run = steps.every((s) => s === 1) || steps.every((s) => s === -1);
  return same || run ? 'weak' : null;
}
