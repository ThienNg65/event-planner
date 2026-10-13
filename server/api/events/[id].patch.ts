import { and, eq, gt, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { STAGES } from '../../db/schema';

const MAX_DAYS = 20; // same cap as eventFields

/** The days named in `b[key]`: absent → [], otherwise an array of real, de-duplicated dates. */
function dayList(b: Record<string, unknown>, key: string) {
  if (!(key in b)) return [];
  if (!Array.isArray(b[key]) || !b[key].every(isDay)) fail(400, 'invalidDays');
  return [...new Set(b[key] as string[])];
}

export default defineEventHandler(async (event) => {
  const { events, responses, venues } = schema;
  const ev = await findEvent(routeId(event));
  const role = await roleOf(event, ev);
  requireCan(role, 'edit');
  const b = await readJson(event);

  // Cancel and restore are host-only and exclusive: Cancelled is an overlay, so restoring keeps the stage.
  if (b.restore === true || 'cancel' in b) {
    requireCan(role, 'cancel');
    const set = b.restore === true ? { cancelledAt: null, cancelReason: null } : { cancelledAt: new Date(), cancelReason: clean(b.cancel, 200) || null };
    await useDb().update(events).set(set).where(eq(events.id, ev.id));
    return { ok: true };
  }
  if (ev.cancelledAt) fail(409, 'cancelled');
  const now = new Date();
  // The server's clock decides "started", the same way votingOpen does.
  const frozen = planFrozen(ev, now.getTime());

  // A correction of the date or place once the plan is fixed: only those fields plus a public notice, and no response writes,
  // so attendance, held seats and payments can't change through it.
  if (b.correct === true) {
    if (!frozen) fail(409, 'stageClosed');
    if (Object.keys(b).some((k) => !['correct', 'startsAt', 'venue', 'venueLink', 'notice'].includes(k))) fail(400, 'invalid');
    const c = eventFields(b);
    if (!c.notice || !('startsAt' in c || 'venue' in c || 'venueLink' in c)) fail(400, 'invalid');
    if ('startsAt' in c && !c.startsAt) fail(400, 'invalidDate');
    // In the RSVP stage the plan is frozen only because the start has passed: a corrected start must stay in the past.
    if (ev.stage === 'rsvp' && c.startsAt && c.startsAt > now) fail(400, 'invalidDate');
    await useDb().update(events).set({ ...c, noticeAt: now }).where(eq(events.id, ev.id));
    return { ok: true };
  }

  // Closing voting stops it now. One conditional UPDATE, so a repeat (or a race) never moves an earlier close time.
  if (b.closeVoting === true) {
    requireCan(role, 'advance');
    if (ev.stage !== 'poll') fail(409, 'stageClosed');
    // The server's clock, the same one votingOpen reads, so the poll counts as closed from this instant.
    const closed = await useDb()
      .update(events)
      .set({ voteDeadline: now })
      .where(and(eq(events.id, ev.id), eq(events.stage, 'poll'), or(isNull(events.voteDeadline), gt(events.voteDeadline, now))))
      .returning({ id: events.id });
    if (!closed.length && (await findEvent(ev.id)).stage !== 'poll') fail(409, 'stageClosed');
    return { ok: true };
  }

  // Day edits: a diff applied to the current list, so a day suggested after the caller loaded the page survives.
  const ops = 'addDays' in b || 'removeDays' in b;
  const addDays = dayList(b, 'addDays');
  const removeDays = dayList(b, 'removeDays');
  if (ops && 'pollDays' in b) fail(400, 'invalid');
  if (ops && ev.stage !== 'poll') fail(409, 'stageClosed');
  if (addDays.some((d) => d < teamToday())) fail(400, 'invalidDays');
  // The day-edit batch has no room for member-row writes, so a day edit can't be combined with a stage move or a plan change.
  // Checked before any query, so a refused request costs nothing.
  if ((ops || 'pollDays' in b) && (('stage' in b && b.stage !== ev.stage) || (ev.stage === 'rsvp' && ('startsAt' in b || 'venue' in b)))) fail(400, 'invalid');

  const { reconfirmBy: wantedBy, ...f } = eventFields(b);
  if (!Object.keys(f).length && !ops) fail(400, 'invalid');
  await requireMembers(f.honorees);
  if (frozen && ('startsAt' in f || 'venue' in f || 'venueLink' in f)) fail(409, 'planFrozen');
  if (f.pollDays && !f.pollDays.length && ev.stage === 'poll') fail(400, 'daysRequired');
  if (f.stage && f.stage !== ev.stage) {
    const jump = STAGES.indexOf(f.stage) - STAGES.indexOf(ev.stage);
    requireCan(role, jump > 0 ? 'advance' : 'reopen');
    if (jump > 1) {
      // The one skip: a started event that never got a bill is completed straight from the RSVP stage.
      if (ev.stage !== 'rsvp' || f.stage !== 'settled' || ev.billTotal !== null || 'billTotal' in b) fail(409, 'stageClosed');
      if (!ev.startsAt || ev.startsAt > now) fail(409, 'notStarted');
    }
  }
  // Reopening voting always names the new deadline (a future time, or null for none) and needs the poll stage.
  const reopen = b.reopenVoting === true;
  if (reopen) {
    if (!('voteDeadline' in b) || (f.stage ?? ev.stage) !== 'poll') fail(400, 'invalid');
    if (ev.stage === 'poll') requireCan(role, 'advance');
  }
  // Back to a day poll: the old locked date would still show during the new vote, so it is cleared (the venue stays).
  const repoll = reopen && f.stage === 'poll' && ev.stage !== 'poll' && ev.pollDays.length > 0;
  // A closed poll is only reopened on purpose: editing the deadline field must not do it by accident.
  if (!reopen && 'voteDeadline' in f && ev.stage === 'poll' && !votingOpen(ev)) fail(409, 'votingClosed');
  // The form resends an unchanged deadline on every save; only a changed one (or a reopen) has to lie in the future.
  if (f.voteDeadline && (reopen || f.voteDeadline.getTime() !== ev.voteDeadline?.getTime()) && f.voteDeadline.getTime() < Date.now()) fail(400, 'invalidDate');
  // Past the poll stage the event needs a fixed date (that's what "Lock" sets).
  const next = { ...ev, ...f, ...(repoll && { startsAt: null }) };
  if (next.stage !== 'poll' && !next.startsAt) fail(400, 'invalidDate');

  // Writes to other members' rows that must land in the same batch as the event UPDATE (batch is the only transaction on Neon HTTP).
  const extras: BatchItem<'pg'>[] = [];
  // Statements that must run before the event UPDATE (they read the event row as it was).
  const before: BatchItem<'pg'>[] = [];
  let reconfirmBy: Date | null | undefined;
  const toPoll = f.stage === 'poll' && ev.stage !== 'poll';
  const lock = f.stage === 'rsvp' && ev.stage === 'poll';
  const leavesRsvp = ev.stage === 'rsvp' && (f.stage === 'bill' || f.stage === 'settled');
  const planMoved =
    ev.stage === 'rsvp' && !f.stage && (('startsAt' in f && f.startsAt?.getTime() !== ev.startsAt?.getTime()) || ('venue' in f && f.venue !== ev.venue));
  const polled = lock || planMoved ? await useDb().select({ id: venues.id, name: venues.name }).from(venues).where(eq(venues.eventId, ev.id)) : [];
  // A fixed-date event with no poll has no votes to derive from.
  const derive = lock || (planMoved && (ev.pollDays.length > 0 || polled.length > 0));
  if (toPoll) {
    // Unpaid derived answers go; payments are never touched, so the host has to acknowledge them.
    const [paid] = await useDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(responses)
      .where(and(eq(responses.eventId, ev.id), or(isNotNull(responses.paidAt), gt(responses.paidAmount, 0))));
    if (paid!.n > 0 && b.acknowledgePayments !== true) fail(409, 'hasPayments');
    extras.push(clearDerived(ev.id));
    reconfirmBy = null;
  } else if (leavesRsvp) {
    extras.push(releaseHolds(ev.id));
    reconfirmBy = null;
  } else if (derive) {
    const plan = planOf(next, polled);
    const { writes, holds } = await attendanceWrites(ev, plan, lock ? 'lock' : 'edit', next);
    if (!lock) {
      // Runs before the event UPDATE, against the deadline read here; it does nothing if another edit changed it meanwhile.
      before.push(releaseExpired(ev.id, ev.reconfirmBy));
      reconfirmBy = null;
      if (holds > 0) {
        if (next.startsAt! <= now) fail(409, 'reconfirmTooLate');
        reconfirmBy = wantedBy ?? new Date(Math.min(now.getTime() + RECONFIRM_MS, next.startsAt!.getTime()));
        if (reconfirmBy <= now || reconfirmBy > next.startsAt!) fail(400, 'invalidDate');
      }
    }
    extras.push(...writes);
  }

  const nextDays = ops
    ? sql`ARRAY(SELECT DISTINCT d FROM unnest(${events.pollDays} || ${sqlArray(addDays, 'date')}) AS d WHERE d <> ALL(${sqlArray(removeDays, 'date')}) ORDER BY d)`
    : f.pollDays && sqlArray(f.pollDays, 'date');
  const set = {
    ...f,
    ...(repoll && { startsAt: null }),
    ...(reconfirmBy !== undefined && { reconfirmBy }),
    ...('notice' in f && f.notice !== ev.notice && { noticeAt: f.notice ? new Date() : null }),
    ...(nextDays && { pollDays: nextDays }),
  };
  // The UPDATE locks the event row and computes the list from the locked current value; the guard rejects an empty or oversized result.
  // With writes to member rows attached, it also requires the stage the decision was made in.
  const update = useDb()
    .update(events)
    .set(set)
    .where(
      ops
        ? and(eq(events.id, ev.id), eq(events.stage, 'poll'), sql`cardinality(${nextDays}) BETWEEN 1 AND ${MAX_DAYS}`)
        : extras.length || before.length
          ? and(eq(events.id, ev.id), eq(events.stage, ev.stage))
          : eq(events.id, ev.id)
    );
  if (!nextDays) {
    if (!extras.length && !before.length) {
      await update;
      return { ok: true };
    }
    const batch = [...before, update.returning({ id: events.id }), ...extras] as [BatchItem<'pg'>, ...BatchItem<'pg'>[]];
    const changed = ((await useDb().batch(batch)) as { id: number }[][])[before.length];
    if (!changed!.length) fail(409, 'stageClosed');
    return { ok: true };
  }
  // Drop votes for days that are no longer candidates in the same batch, or a member's next vote would be rejected as invalidDays.
  const current = currentDays(ev.id);
  const prune = useDb()
    .update(responses)
    .set({ days: sql`ARRAY(SELECT d FROM unnest(${responses.days}) AS d WHERE d = ANY(${current}))` })
    .where(and(eq(responses.eventId, ev.id), sql`NOT (${responses.days} <@ ${current})`));
  const [changed] = await useDb().batch([update.returning({ id: events.id }), prune]);
  if (ops && !changed.length) {
    // Nothing matched: work out why against the current state.
    const now = await findEvent(ev.id);
    if (now.stage !== 'poll') fail(409, 'stageClosed');
    const left = new Set([...now.pollDays, ...addDays].filter((d) => !removeDays.includes(d)));
    if (!left.size) fail(400, 'daysRequired');
    fail(409, left.size > MAX_DAYS ? 'tooManyDays' : 'daysChanged');
  }
  return { ok: true };
});
