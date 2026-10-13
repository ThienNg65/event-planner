import { and, eq, sql } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const { venues, responses } = schema;
  const ev = await findEvent(routeId(event));
  requireCan(await roleOf(event, ev), 'removeVenue');
  if (ev.cancelledAt) fail(409, 'cancelled');
  const venueId = Number(getRouterParam(event, 'venueId'));
  if (!Number.isInteger(venueId)) fail(404, 'notFound');
  // One batch: the event-row lock first (a vote naming this place finishes or waits), then the venue and every vote for it go together.
  await useDb().batch([
    useDb().select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.id, ev.id)).for('update'),
    useDb().delete(venues).where(and(eq(venues.id, venueId), eq(venues.eventId, ev.id))),
    useDb()
      .update(responses)
      .set({ venueIds: sql`array_remove(${responses.venueIds}, ${venueId})` })
      .where(eq(responses.eventId, ev.id)),
  ]);
  return { ok: true };
});
