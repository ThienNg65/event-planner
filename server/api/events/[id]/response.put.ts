import { eq, sql } from 'drizzle-orm';
import { STATUSES } from '../../../db/schema';

export default defineEventHandler(async (event) => {
  const { responses, venues } = schema;
  const ev = await findEvent(routeId(event));
  const role = roleOf(event, ev);
  const b = await readJson(event);
  const member = await requireMember(b.memberId);
  requireSelf(event, member.id, role);
  if (ev.cancelledAt) fail(409, 'cancelled');
  // The organizers may fix anyone's answer at any stage; everyone else only while that block is open.
  const open = (...stages: string[]) => role !== null || stages.includes(ev.stage);
  const set: Partial<typeof responses.$inferInsert> = {};

  if ('days' in b) {
    requireVoting(ev, role);
    if (!Array.isArray(b.days) || !b.days.every((d) => ev.pollDays.includes(d))) fail(400, 'invalidDays');
    set.days = [...new Set(b.days as string[])];
  }
  if ('venueIds' in b) {
    requireVoting(ev, role);
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
  if ('paidAmount' in b) {
    // Participants stop editing once the event is Completed; organizers may still correct the ledger.
    if (!(role !== null ? ['bill', 'settled'] : ['bill']).includes(ev.stage)) fail(409, 'stageClosed');
    if (b.paidAmount !== null && !intIn(b.paidAmount, 0, 1_000_000_000)) fail(400, 'invalid');
    set.paidAmount = b.paidAmount || null;
    set.paidAt = b.paidAmount ? new Date() : null;
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
