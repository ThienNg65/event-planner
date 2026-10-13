import { createHash, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
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

const hashMatches = (key: string, hash: string | null) =>
  !!hash && timingSafeEqual(Buffer.from(sha256(key), 'hex'), Buffer.from(hash, 'hex'));

/** The caller's role, from the x-manage-key header: the manage key is the host; the legacy shared key or a named co-host's access key is a co-host. */
export async function roleOf(event: H3Event, ev: { id: number; manageKeyHash: string; coHostKeyHash: string | null }): Promise<Role> {
  const key = getHeader(event, 'x-manage-key');
  if (!key) return null;
  if (hashMatches(key, ev.manageKeyHash)) return 'host';
  if (hashMatches(key, ev.coHostKeyHash)) return 'cohost';
  const { cohosts } = schema;
  const [row] = await useDb()
    .select({ memberId: cohosts.memberId })
    .from(cohosts)
    .where(and(eq(cohosts.eventId, ev.id), eq(cohosts.keyHash, sha256(key)), eq(cohosts.status, 'active')));
  return row ? 'cohost' : null;
}

/** The visitor's member id from the unsigned `me` cookie (guards against mistakes, not attackers). */
export function meOf(event: H3Event) {
  const me = Number(getCookie(event, 'me'));
  return Number.isInteger(me) && me > 0 ? me : null;
}

/** A participant may only write their own answers; hosts and co-hosts may write anyone's. */
export function requireSelf(event: H3Event, memberId: number, role: Role) {
  if (role === null && memberId !== meOf(event)) fail(403, 'notYou');
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
