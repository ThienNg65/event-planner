import { and, eq } from 'drizzle-orm';

/** Revoke (host: any row) or leave (a co-host: only the row their own access key belongs to). */
export default defineEventHandler(async (event) => {
  const { cohosts } = schema;
  const ev = await findEvent(routeId(event));
  const role = await roleOf(event, ev);
  const memberId = Number(getRouterParam(event, 'memberId'));
  if (!Number.isInteger(memberId)) fail(404, 'notFound');
  if (role === 'host') {
    await useDb().delete(cohosts).where(and(eq(cohosts.eventId, ev.id), eq(cohosts.memberId, memberId)));
    return { ok: true };
  }
  if (role !== 'cohost') fail(403, 'forbidden');
  const key = getHeader(event, 'x-manage-key') ?? '';
  const left = await useDb()
    .delete(cohosts)
    .where(and(eq(cohosts.eventId, ev.id), eq(cohosts.memberId, memberId), eq(cohosts.keyHash, sha256(key))))
    .returning({ memberId: cohosts.memberId });
  if (!left.length) fail(403, 'hostOnly');
  return { ok: true };
});
