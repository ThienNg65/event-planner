import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { STAGES } from '../../db/schema';

const MAX_DAYS = 20; // same cap as eventFields

/** The days named in `b[key]`: absent → [], otherwise an array of real, de-duplicated dates. */
function dayList(b: Record<string, unknown>, key: string) {
  if (!(key in b)) return [];
  if (!Array.isArray(b[key]) || !b[key].every(isDay)) fail(400, 'invalidDays');
  return [...new Set(b[key] as string[])];
}

export default defineEventHandler(async (event) => {
  const { events, responses } = schema;
  const ev = await findEvent(routeId(event));
  const role = roleOf(event, ev);
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

  // Closing voting stops it now. One conditional UPDATE, so a repeat (or a race) never moves an earlier close time.
  if (b.closeVoting === true) {
    requireCan(role, 'advance');
    if (ev.stage !== 'poll') fail(409, 'stageClosed');
    const closed = await useDb()
      .update(events)
      .set({ voteDeadline: sql`now()` })
      .where(and(eq(events.id, ev.id), eq(events.stage, 'poll'), or(isNull(events.voteDeadline), gt(events.voteDeadline, sql`now()`))))
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

  const f = eventFields(b);
  if (!Object.keys(f).length && !ops) fail(400, 'invalid');
  if (f.pollDays && !f.pollDays.length && ev.stage === 'poll') fail(400, 'daysRequired');
  if (f.stage && f.stage !== ev.stage) {
    const jump = STAGES.indexOf(f.stage) - STAGES.indexOf(ev.stage);
    requireCan(role, jump > 0 ? 'advance' : 'reopen');
    if (jump > 1) fail(409, 'stageClosed');
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

  const nextDays = ops
    ? sql`ARRAY(SELECT DISTINCT d FROM unnest(${events.pollDays} || ${sqlArray(addDays, 'date')}) AS d WHERE d <> ALL(${sqlArray(removeDays, 'date')}) ORDER BY d)`
    : f.pollDays && sqlArray(f.pollDays, 'date');
  const set = { ...f, ...(repoll && { startsAt: null }), ...('notice' in f && f.notice !== ev.notice && { noticeAt: f.notice ? new Date() : null }), ...(nextDays && { pollDays: nextDays }) };
  // The UPDATE locks the event row and computes the list from the locked current value; the guard rejects an empty or oversized result.
  const update = useDb()
    .update(events)
    .set(set)
    .where(ops ? and(eq(events.id, ev.id), eq(events.stage, 'poll'), sql`cardinality(${nextDays}) BETWEEN 1 AND ${MAX_DAYS}`) : eq(events.id, ev.id));
  if (!nextDays) {
    await update;
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
