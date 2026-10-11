import { eq, sql, type SQL } from 'drizzle-orm';
import { STATUSES } from '../../../db/schema';

export default defineEventHandler(async (event) => {
  const { events, responses } = schema;
  const ev = await findEvent(routeId(event));
  const role = roleOf(event, ev);
  const b = await readJson(event);
  const member = await requireMember(b.memberId);
  requireSelf(event, member.id, role);
  if (ev.cancelledAt) fail(409, 'cancelled');
  // The organizers may fix anyone's answer at any stage; everyone else only while that block is open.
  const open = (...stages: string[]) => role !== null || stages.includes(ev.stage);
  const set: Partial<typeof responses.$inferInsert> = {};
  // Days and places are filtered against the current lists inside the write itself (see the batch below).
  const wanted: { days?: string[]; venueIds?: number[] } = {};
  const picks: { days?: SQL; venueIds?: SQL } = {};

  if ('days' in b) {
    requireVoting(ev, role);
    if (!Array.isArray(b.days) || !b.days.every(isDay)) fail(400, 'invalidDays');
    wanted.days = [...new Set(b.days as string[])];
    picks.days = sql`ARRAY(SELECT DISTINCT d FROM unnest(${sqlArray(wanted.days, 'date')}) AS d WHERE d = ANY(${currentDays(ev.id)}) ORDER BY d)`;
  }
  if ('venueIds' in b) {
    requireVoting(ev, role);
    if (!Array.isArray(b.venueIds) || !b.venueIds.every((v) => Number.isInteger(v))) fail(400, 'unknownVenue');
    wanted.venueIds = [...new Set(b.venueIds as number[])];
    picks.venueIds = sql`ARRAY(SELECT DISTINCT v FROM unnest(${sqlArray(wanted.venueIds, 'int')}) AS v WHERE v IN ${currentVenueIds(ev.id)} ORDER BY v)`;
  }
  if ('status' in b) {
    if (!open('rsvp')) fail(409, 'stageClosed');
    if (b.status !== null && !STATUSES.includes(b.status as never)) fail(400, 'invalid');
    const guests = b.guests ?? 0;
    if (!intIn(guests, 0, 10)) fail(400, 'invalidGuests');
    set.status = b.status as (typeof STATUSES)[number] | null;
    set.guests = guests;
  }
  if ('paidAmount' in b || 'addPaid' in b || b.paid === true) {
    // Participants stop editing once the event is Completed; organizers may still correct the ledger.
    if (!(role !== null ? ['bill', 'settled'] : ['bill']).includes(ev.stage)) fail(409, 'stageClosed');
    if (b.paid === true) {
      // Paid in full: no amount, so it stays full if the bill or guests change later.
      set.paidAmount = null;
      set.paidAt = new Date();
    } else if ('addPaid' in b) {
      if (!intIn(b.addPaid, 1, 1_000_000_000)) fail(400, 'invalid');
      set.paidAmount = b.addPaid;
      set.paidAt = new Date();
    } else {
      if (b.paidAmount !== null && !intIn(b.paidAmount, 0, 1_000_000_000)) fail(400, 'invalid');
      set.paidAmount = b.paidAmount || null;
      set.paidAt = b.paidAmount ? new Date() : null;
    }
  }
  if (!Object.keys(set).length && !Object.keys(picks).length) fail(400, 'invalid');

  // Queue position: a fresh "going" or more guests goes to the back; otherwise keep the old spot.
  const goingAt = sql`CASE
    WHEN excluded.status = 'going' AND (${responses.status} IS DISTINCT FROM 'going' OR excluded.guests > ${responses.guests}) THEN now()
    WHEN excluded.status = 'going' THEN ${responses.goingAt}
    ELSE NULL END`;
  const upsert = useDb()
    .insert(responses)
    .values({ ...set, ...picks, eventId: ev.id, memberId: member.id, goingAt: set.status === 'going' ? sql`now()` : null })
    .onConflictDoUpdate({
      target: [responses.eventId, responses.memberId],
      set: {
        ...set,
        ...picks,
        ...('status' in set && { goingAt }),
        // An increment, so a payment never overwrites a correction made since the page loaded.
        ...('addPaid' in b && { paidAmount: sql`COALESCE(${responses.paidAmount}, 0) + ${set.paidAmount}` }),
      },
    });
  if (!Object.keys(picks).length) {
    await upsert;
    return { ok: true };
  }
  // The share lock waits for an edit of the days or places in flight (voters don't block each other), so the filter sees its result.
  const lock = useDb().select({ id: events.id }).from(events).where(eq(events.id, ev.id)).for('share');
  const [, [saved]] = await useDb().batch([lock, upsert.returning({ days: responses.days, venueIds: responses.venueIds })]);
  // Part of the request named a day or place that was removed meanwhile: the rest is saved, the client refreshes.
  if (wanted.days && saved!.days.length < wanted.days.length) fail(409, 'daysChanged');
  if (wanted.venueIds && saved!.venueIds.length < wanted.venueIds.length) fail(409, 'venuesChanged');
  return { ok: true };
});
