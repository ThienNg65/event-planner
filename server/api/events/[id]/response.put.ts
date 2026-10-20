import { eq, sql, type SQL } from 'drizzle-orm';
import { STATUSES } from '../../../db/schema';

export default defineEventHandler(async (event) => {
  const { events, responses } = schema;
  const id = routeId(event);
  const b = await readJson(event);
  const paying = 'paidAmount' in b || 'addPaid' in b || b.paid === true;
  // Read together: each database round trip is the slow part of a vote. A payment also needs the rows, to check the payer's seat.
  const [ev, member, rows, joined] = await Promise.all([
    findEvent(id),
    requireMember(b.memberId),
    paying ? useDb().select().from(responses).where(eq(responses.eventId, id)) : Promise.resolve([]),
    meOf(event).then((me) => isParticipant(id, me)),
  ]);
  const role = await roleOf(event, ev);
  await requireAccess(event, ev, role, joined);
  await requireSelf(event, member.id, role);
  if (ev.cancelledAt) fail(409, 'cancelled');
  // The organizers may fix anyone's answer at any stage; everyone else only while that block is open.
  const open = (...stages: string[]) => role !== null || stages.includes(ev.stage);
  const set: Partial<typeof responses.$inferInsert> = {};
  // Days and places are filtered against the current lists inside the write itself (see the batch below).
  const wanted: { days?: string[]; venueIds?: number[]; maybeDays?: string[]; maybeVenueIds?: number[] } = {};
  const picks: { days?: SQL; venueIds?: SQL; maybeDays?: SQL; maybeVenueIds?: SQL } = {};

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
  // "If need be" picks: a day or place sent as yes in the same request is dropped from them, so the two lists stay apart.
  if ('maybeDays' in b) {
    requireVoting(ev, role);
    if (!Array.isArray(b.maybeDays) || !b.maybeDays.every(isDay)) fail(400, 'invalidDays');
    wanted.maybeDays = [...new Set(b.maybeDays as string[])].filter((d) => !wanted.days?.includes(d));
    picks.maybeDays = sql`ARRAY(SELECT DISTINCT d FROM unnest(${sqlArray(wanted.maybeDays, 'date')}) AS d WHERE d = ANY(${currentDays(ev.id)}) ORDER BY d)`;
  }
  if ('maybeVenueIds' in b) {
    requireVoting(ev, role);
    if (!Array.isArray(b.maybeVenueIds) || !b.maybeVenueIds.every((v) => Number.isInteger(v))) fail(400, 'unknownVenue');
    wanted.maybeVenueIds = [...new Set(b.maybeVenueIds as number[])].filter((v) => !wanted.venueIds?.includes(v));
    picks.maybeVenueIds = sql`ARRAY(SELECT DISTINCT v FROM unnest(${sqlArray(wanted.maybeVenueIds, 'int')}) AS v WHERE v IN ${currentVenueIds(ev.id)} ORDER BY v)`;
  }
  if ('status' in b) {
    // While polling, a member may say up front they can't come (or take it back), on the same terms as a vote.
    const pollDecline = ev.stage === 'poll' && (b.status === 'no' || b.status === null);
    if (pollDecline) requireVoting(ev, role);
    else if (!open('rsvp')) fail(409, 'stageClosed');
    if (b.status !== null && !STATUSES.includes(b.status as never)) fail(400, 'invalid');
    const guests = b.guests ?? 0;
    if (!intIn(guests, 0, MAX_GUESTS)) fail(400, 'invalidGuests');
    // Lowering the limit never rewrites rows; it only stops members from asking for more. Organizers may set any number.
    if (role === null && (guests as number) > guestLimit(ev)) fail(400, 'tooManyGuests');
    set.status = b.status as (typeof STATUSES)[number] | null;
    set.guests = guests;
    // An answer given by the member is explicit: it is no longer counted from their votes or held.
    set.derived = null;
    // A fresh answer (or an organizer's fix) replaces the attendance check's "didn't come".
    set.noShow = false;
    // A sponsor amount belongs to a seat at the bill; a changed answer drops it.
    if (b.status !== 'going') set.sponsorAmount = null;
    // Declining a poll withdraws the votes too, so they no longer count toward a day or place.
    if (pollDecline && b.status === 'no') Object.assign(set, { days: [], venueIds: [], maybeDays: [], maybeVenueIds: [] });
  }
  if (paying) {
    // After Completed, participants may still report a payment (addPaid); setting or clearing amounts stays with the organizers.
    const stages = role !== null || 'addPaid' in b ? ['bill', 'settled'] : ['bill'];
    if (!stages.includes(ev.stage)) fail(409, 'stageClosed');
    // Only a member with a seat owes a share, so only they can report paying one (organizers may record anyone).
    if (role === null && !rollCall(seated(rows, ev), ev.capacity).confirmed.some((r) => r.memberId === member.id)) fail(409, 'notAttending');
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
  // A held seat keeps its spot only while the confirm-by deadline (read with the database clock) hasn't passed.
  const goingAt = sql`CASE
    WHEN excluded.status = 'going' AND ${responses.derived} = 'reconfirm' AND excluded.guests <= ${responses.guests} AND (SELECT reconfirm_by FROM events WHERE id = ${ev.id}) > now() THEN ${responses.goingAt}
    WHEN excluded.status = 'going' AND ${responses.derived} = 'reconfirm' THEN now()
    WHEN excluded.status = 'going' AND (${responses.status} IS DISTINCT FROM 'going' OR excluded.guests > ${responses.guests}) THEN now()
    WHEN excluded.status = 'going' THEN ${responses.goingAt}
    ELSE NULL END`;
  // Set once, on the first vote write; later edits (even emptying the votes) never move it.
  const firstVote: { firstVotedAt?: SQL } = Object.keys(picks).length ? { firstVotedAt: sql`now()` } : {};
  const upsert = useDb()
    .insert(responses)
    .values({ ...set, ...picks, ...firstVote, eventId: ev.id, memberId: member.id, goingAt: set.status === 'going' ? sql`now()` : null })
    .onConflictDoUpdate({
      target: [responses.eventId, responses.memberId],
      set: {
        ...set,
        ...picks,
        ...(firstVote.firstVotedAt && { firstVotedAt: sql`COALESCE(${responses.firstVotedAt}, now())` }),
        ...('status' in set && { goingAt }),
        // An increment, so a payment never overwrites a correction made since the page loaded.
        ...('addPaid' in b && { paidAmount: sql`COALESCE(${responses.paidAmount}, 0) + ${set.paidAmount}` }),
      },
    });
  if (!Object.keys(picks).length) {
    // A payment an organizer records for someone else is mailed to that member (the member's own report is not).
    const outbox = role !== null && set.paidAt && member.id !== (await meOf(event)) ? queuePaymentRecorded(ev.id, member.id, set.paidAt) : [];
    await commit(event, ev.id, [upsert], outbox);
    return { ok: true };
  }
  // The share lock waits for an edit of the days or places in flight (voters don't block each other), so the filter sees its result.
  const lock = useDb().select({ id: events.id }).from(events).where(eq(events.id, ev.id)).for('share');
  const [, [saved]] = await useDb().batch([lock, upsert.returning({ days: responses.days, venueIds: responses.venueIds, maybeDays: responses.maybeDays, maybeVenueIds: responses.maybeVenueIds })]);
  // Part of the request named a day or place that was removed meanwhile: the rest is saved, the client refreshes.
  if (wanted.days && saved!.days.length < wanted.days.length) fail(409, 'daysChanged');
  if (wanted.venueIds && saved!.venueIds.length < wanted.venueIds.length) fail(409, 'venuesChanged');
  if (wanted.maybeDays && saved!.maybeDays.length < wanted.maybeDays.length) fail(409, 'daysChanged');
  if (wanted.maybeVenueIds && saved!.maybeVenueIds.length < wanted.maybeVenueIds.length) fail(409, 'venuesChanged');
  return { ok: true };
});
