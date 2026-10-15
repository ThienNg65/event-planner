import { and, eq, or } from 'drizzle-orm';

/** Withdraws the pending offer (the creator) or turns it down (the target). Nothing to withdraw is not an error. */
export default defineEventHandler(async (event) => {
  const { events } = schema;
  const me = await meOf(event);
  if (me === null) fail(401, 'signInFirst');
  const ev = await findEvent(routeId(event));
  await useDb()
    .update(events)
    .set({ handoverTo: null, handoverAt: null })
    .where(and(eq(events.id, ev.id), or(eq(events.createdBy, me), eq(events.handoverTo, me))));
  return { ok: true };
});
