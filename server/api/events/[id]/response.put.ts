import { eq, sql } from 'drizzle-orm';
import { STATUSES } from '../../../db/schema';

type Stage = (typeof schema.events.$inferSelect)['stage'];

export default defineEventHandler(async (event) => {
  const { responses, venues } = schema;
  const ev = await findEvent(routeId(event));
  const b = await readJson(event);
  const member = await requireMember(b.memberId);
  // The organizer may fix anyone's answer at any stage; everyone else only while that block is open.
  const open = (...stages: Stage[]) => isManager(event, ev.manageKeyHash) || stages.includes(ev.stage);
  const set: Partial<typeof responses.$inferInsert> = {};

  if ('days' in b) {
    if (!open('poll')) fail(409, 'stageClosed');
    if (!Array.isArray(b.days) || !b.days.every((d) => ev.pollDays.includes(d))) fail(400, 'invalidDays');
    set.days = [...new Set(b.days as string[])];
  }
  if ('venueIds' in b) {
    if (!open('poll')) fail(409, 'stageClosed');
    const known = (await useDb().select({ id: venues.id }).from(venues).where(eq(venues.eventId, ev.id))).map((v) => v.id);
    if (!Array.isArray(b.venueIds) || !b.venueIds.every((v) => known.includes(v))) fail(400, 'unknownVenue');
    set.venueIds = [...new Set(b.venueIds as number[])];
  }
  if ('status' in b) {
    if (!open('rsvp')) fail(409, 'stageClosed');
    if (b.status !== null && !STATUSES.includes(b.status as never)) fail(400, 'invalid');
    const guests = b.guests ?? 0;
    if (!intIn(guests, 0, 10)) fail(400, 'invalidGuests');
    set.status = b.status as (typeof STATUSES)[number] | null;
    set.guests = guests;
  }
  if ('paid' in b) {
    if (!open('bill', 'settled')) fail(409, 'stageClosed');
    if (typeof b.paid !== 'boolean') fail(400, 'invalid');
    set.paidAt = b.paid ? new Date() : null;
  }
  if (!Object.keys(set).length) fail(400, 'invalid');

  // Queue position: a fresh "going" or more guests goes to the back; otherwise keep the old spot.
  const goingAt = sql`CASE
    WHEN excluded.status = 'going' AND (${responses.status} IS DISTINCT FROM 'going' OR excluded.guests > ${responses.guests}) THEN now()
    WHEN excluded.status = 'going' THEN ${responses.goingAt}
    ELSE NULL END`;
  await useDb()
    .insert(responses)
    .values({ ...set, eventId: ev.id, memberId: member.id, goingAt: set.status === 'going' ? sql`now()` : null })
    .onConflictDoUpdate({
      target: [responses.eventId, responses.memberId],
      set: 'status' in set ? { ...set, goingAt } : set,
    });
  return { ok: true };
});
