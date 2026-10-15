import { and, eq, sql } from 'drizzle-orm';

/** Run after the row delete in the same batch: the offer to hand the event to a member dies once they are no longer a co-host. */
const clearOffer = (eventId: number, memberId: number) =>
  useDb()
    .update(schema.events)
    .set({ handoverTo: null, handoverAt: null })
    .where(
      and(
        eq(schema.events.id, eventId),
        eq(schema.events.handoverTo, memberId),
        sql`not exists (select 1 from ${schema.cohosts} where ${schema.cohosts.eventId} = ${eventId} and ${schema.cohosts.memberId} = ${memberId})`
      )
    );

/** Revoke (host: any row) or leave (a co-host: only the row their own access key belongs to). */
export default defineEventHandler(async (event) => {
  const { cohosts } = schema;
  const ev = await findEvent(routeId(event));
  const role = await roleOf(event, ev);
  await requireAccess(event, ev, role);
  const memberId = Number(getRouterParam(event, 'memberId'));
  if (!Number.isInteger(memberId)) fail(404, 'notFound');
  if (role === 'host') {
    await useDb().batch([useDb().delete(cohosts).where(and(eq(cohosts.eventId, ev.id), eq(cohosts.memberId, memberId))), clearOffer(ev.id, memberId)]);
    return { ok: true };
  }
  if (role !== 'cohost') fail(403, 'forbidden');
  const key = getHeader(event, 'x-manage-key') ?? '';
  const [left] = await useDb().batch([
    useDb()
      .delete(cohosts)
      .where(and(eq(cohosts.eventId, ev.id), eq(cohosts.memberId, memberId), eq(cohosts.keyHash, sha256(key))))
      .returning({ memberId: cohosts.memberId }),
    clearOffer(ev.id, memberId),
  ]);
  if (!left.length) fail(403, 'hostOnly');
  return { ok: true };
});
