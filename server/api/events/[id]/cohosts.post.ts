import { randomBytes } from 'node:crypto';
import { and, eq, ne, sql } from 'drizzle-orm';

/**
 * Invites a roster member as a named co-host (or re-invites, or re-issues an active co-host's access).
 * Only the hash of the single-use invite is stored; the secret is returned once.
 */
export default defineEventHandler(async (event) => {
  const { cohosts } = schema;
  const ev = await findEvent(routeId(event));
  const role = await roleOf(event, ev);
  await requireAccess(event, ev, role);
  requireCan(role, 'cohost');
  const b = await readJson(event);
  const member = await requireMember(b.memberId);
  if (ev.cancelledAt) fail(409, 'cancelled');

  const [row] = await useDb().select().from(cohosts).where(and(eq(cohosts.eventId, ev.id), eq(cohosts.memberId, member.id)));
  if (row?.status === 'active' && b.reissue !== true) fail(409, 'alreadyCohost');
  const others = await useDb().select({ n: sql<number>`count(*)::int` }).from(cohosts).where(and(eq(cohosts.eventId, ev.id), ne(cohosts.memberId, member.id)));
  if ((others[0]?.n ?? 0) >= MAX_COHOSTS) fail(409, 'tooManyCohosts');

  const invite = randomBytes(32).toString('base64url');
  const set = { status: 'invited' as const, inviteHash: sha256(invite), keyHash: null, invitedAt: new Date(), acceptedAt: null };
  await useDb()
    .insert(cohosts)
    .values({ eventId: ev.id, memberId: member.id, ...set })
    .onConflictDoUpdate({ target: [cohosts.eventId, cohosts.memberId], set });
  return { invite };
});
