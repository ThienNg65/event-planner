import { and, eq, sql } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const { venues, responses } = schema;
  const ev = await findEvent(routeId(event));
  requireCan(roleOf(event, ev), 'removeVenue');
  if (ev.cancelledAt) fail(409, 'cancelled');
  const venueId = Number(getRouterParam(event, 'venueId'));
  if (!Number.isInteger(venueId)) fail(404, 'notFound');
  // One batch: the venue and every vote for it go together.
  await useDb().batch([
    useDb().delete(venues).where(and(eq(venues.id, venueId), eq(venues.eventId, ev.id))),
    useDb()
      .update(responses)
      .set({ venueIds: sql`array_remove(${responses.venueIds}, ${venueId})` })
      .where(eq(responses.eventId, ev.id)),
  ]);
  return { ok: true };
});
