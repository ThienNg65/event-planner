import { createHash, timingSafeEqual } from 'node:crypto';
import { and, eq, or } from 'drizzle-orm';
import type { H3Event } from 'h3';

export function fail(statusCode: number, message: string): never {
  throw createError({ statusCode, statusMessage: message });
}

/** Trimmed string capped at `max` chars; '' for anything that isn't a string. */
export const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const isHttpUrl = (s: string) => /^https?:\/\//i.test(s);

export const intIn = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function routeId(event: H3Event) {
  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id) || id < 1) fail(404, 'notFound');
  return id;
}

export const hashMatches = (key: string, hash: string | null) =>
  !!hash && timingSafeEqual(Buffer.from(sha256(key), 'hex'), Buffer.from(hash, 'hex'));

/**
 * The caller's role. The manage key, or being signed in as the creator, makes the host; the legacy shared key, a named
 * co-host's access key, or being signed in as an active named co-host makes a co-host.
 */
export async function roleOf(
  event: H3Event,
  ev: { id: number; createdBy: number; manageKeyHash: string; coHostKeyHash: string | null }
): Promise<Role> {
  const key = getHeader(event, 'x-manage-key');
  if (key && hashMatches(key, ev.manageKeyHash)) return 'host';
  const me = await meOf(event);
  if (me === ev.createdBy) return 'host';
  if (key && hashMatches(key, ev.coHostKeyHash)) return 'cohost';
  if (!key && me === null) return null;
  const { cohosts } = schema;
  const [row] = await useDb()
    .select({ memberId: cohosts.memberId })
    .from(cohosts)
    .where(
      and(
        eq(cohosts.eventId, ev.id),
        eq(cohosts.status, 'active'),
        or(key ? eq(cohosts.keyHash, sha256(key)) : undefined, me === null ? undefined : eq(cohosts.memberId, me))
      )
    );
  return row ? 'cohost' : null;
}

const SID = 'sid';

/** Signs this browser in: the random token goes into an httpOnly cookie, only its hash is stored. */
export function setSession(event: H3Event, token: string) {
  setCookie(event, SID, token, { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax', path: '/', maxAge: 400 * 24 * 3600 });
  // The old unsigned member-id cookie no longer means anything.
  deleteCookie(event, 'me');
}

export const sessionToken = (event: H3Event) => getCookie(event, SID) || null;

/** Signs this browser out. The member's token stays valid, so their sign-in link still works. */
export const clearSession = (event: H3Event) => deleteCookie(event, SID, { path: '/' });

/** The member a sign-in token belongs to, or null. */
export async function memberByToken(token: string | null) {
  if (!token) return null;
  const { members } = schema;
  const [m] = await useDb().select({ id: members.id, name: members.name }).from(members).where(eq(members.tokenHash, sha256(token)));
  return m ?? null;
}

/** The signed-in member id from the `sid` cookie, or null. Looked up once per request. */
export function meOf(event: H3Event): Promise<number | null> {
  return (event.context.me ??= memberByToken(sessionToken(event)).then((m) => m?.id ?? null));
}

/** A participant may only write their own answers; hosts and co-hosts may write anyone's. */
export async function requireSelf(event: H3Event, memberId: number, role: Role) {
  if (role === null && memberId !== (await meOf(event))) fail(403, 'notYou');
}

export function requireCan(role: Role, action: Action) {
  if (!can(role, action)) fail(403, role ? 'hostOnly' : 'forbidden');
}

/** Poll writes: not cancelled, still polling, and (for participants) before the deadline. */
export function requireVoting(ev: Parameters<typeof votingOpen>[0], role: Role) {
  if (ev.cancelledAt) fail(409, 'cancelled');
  if (ev.stage !== 'poll') fail(409, 'stageClosed');
  if (role === null && !votingOpen(ev)) fail(409, 'votingClosed');
}

export async function readJson(event: H3Event): Promise<Record<string, unknown>> {
  const body = await readBody(event).catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'invalid');
  return body;
}
