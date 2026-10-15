/** One-time codes are this many digits. */
export const EMAIL_CODE_LENGTH = 6;
/** A code as typed: exactly EMAIL_CODE_LENGTH digits. */
export const isCodeFormat = (code: string) => code.length === EMAIL_CODE_LENGTH && /^\d+$/.test(code);
export const EMAIL_CODE_TTL_MS = 15 * 60_000;
/** Wrong codes allowed before the code is burned. */
export const EMAIL_CODE_MAX_FAILS = 5;
/** After an address change, recovery codes still go to the old address (and its "not me" link works) this long. */
export const EMAIL_CHANGE_COOLDOWN_MS = 72 * 3_600_000;
/** Minimum seconds between two codes for the same member and purpose. */
export const CODE_GAP_SECS = 60;
export const VERIFY_CODES_PER_DAY = 5;
export const RECOVER_CODES_PER_MEMBER_DAY = 3;
export const RECOVER_CODES_GLOBAL_DAY = 15;
/** Resend's free plan sends 100 a day: codes stop at 95 in the last 24 h, notifications defer at 70 to leave room for codes. */
export const MAIL_BUDGET_CODES = 95;
export const MAIL_BUDGET_NOTIFY = 70;
/** Bump when the consent wording changes; stored with each member's consent. */
export const EMAIL_CONSENT_VERSION = '2026-10.2';

/** The address trimmed and lower-cased, or null when it is not a plausible single address. */
export function normalizeEmail(v: unknown) {
  if (typeof v !== 'string') return null;
  const email = v.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]{2,}$/.test(email) ? email : null;
}

/** `ALLOWED_EMAIL_DOMAINS` as a list of lower-case domains; empty means any domain. */
export const parseDomains = (csv: string | undefined) =>
  (csv ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);

/** Whether the address belongs to an allowed domain (exactly; subdomains are not included). An empty list allows any. */
export const domainAllowed = (email: string, domains: string[]) => !domains.length || domains.includes(email.slice(email.lastIndexOf('@') + 1));

/** Mail kinds: codes and security notices may use the whole budget, notifications only the first part. */
export type MailKind = 'code' | 'notice' | 'notify';
export const mailLimit = (kind: MailKind) => (kind === 'notify' ? MAIL_BUDGET_NOTIFY : MAIL_BUDGET_CODES);
/** Whether one more mail of this kind fits after `sent` sends in the last 24 h. */
export const mailAllowed = (sent: number, kind: MailKind) => sent < mailLimit(kind);

/**
 * The address a new verified `email` leaves as "previous", or null when nothing changed hands. While an earlier change is
 * still inside its cool-down the original address stays the previous one, so a second quick change can't wipe it.
 */
export function previousAddress(
  old: { email: string; prevEmail: string | null; prevUntil: Date | null } | undefined,
  email: string,
  now = new Date()
) {
  if (!old || old.email === email) return null;
  return old.prevEmail && old.prevUntil && old.prevUntil > now ? old.prevEmail : old.email;
}
