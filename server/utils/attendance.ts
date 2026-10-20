import { and, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

/** The plan a (next) date and place give; `venues` are the event's polled places. */
export const planOf = (next: { pollDays: string[]; startsAt: Date | null; venue: string | null }, venues: { id: number; name: string }[]) =>
  planFor(next.pollDays, next.startsAt, venues, next.venue);

const clear = { status: null, goingAt: null, derived: null } as const;

/**
 * Releases held seats whose confirm-by deadline (`deadline`, as the caller read it) has passed. It runs before the batch's
 * event UPDATE and only while the stored deadline is still `deadline`: a new deadline can never revive an expired hold, and
 * a plan edit that committed meanwhile (with fresh holds under its own deadline) cancels the release.
 */
export const releaseExpired = (eventId: number, deadline: Date | null) => {
  const { responses } = schema;
  return useDb()
    .update(responses)
    .set(clear)
    .where(
      and(
        eq(responses.eventId, eventId),
        eq(responses.derived, 'reconfirm'),
        isNull(responses.paidAt),
        sql`COALESCE(${deadline}::timestamptz, '-infinity') <= now()`,
        // Compared at millisecond precision: the deadline read into JS has lost the microseconds Postgres may store.
        sql`EXISTS (SELECT 1 FROM events WHERE id = ${eventId} AND date_trunc('milliseconds', reconfirm_by) IS NOT DISTINCT FROM ${deadline}::timestamptz)`
      )
    );
};

/** Releases every pending hold (entering the bill, completing, reopening to the poll). */
export const releaseHolds = (eventId: number) => {
  const { responses } = schema;
  return useDb()
    .update(responses)
    .set(clear)
    .where(and(eq(responses.eventId, eventId), eq(responses.derived, 'reconfirm'), isNull(responses.paidAt)));
};

/** Reopening to the poll: unpaid derived answers and holds go; explicit answers and votes stay. */
export const clearDerived = (eventId: number) => {
  const { responses } = schema;
  return useDb()
    .update(responses)
    .set(clear)
    .where(and(eq(responses.eventId, eventId), isNotNull(responses.derived), isNull(responses.paidAt)));
};

/**
 * The attendance check when the bill is entered. It overwrites explicit answers on purpose (the organizer says who came),
 * but never a paid row. The statements go before the batch's event UPDATE: the row lock stops a concurrent stage move,
 * and each write needs the event still in `rsvp`, so a lost race writes nothing.
 */
export function checkInWrites(eventId: number, r: ReturnType<typeof attendanceCheck>) {
  const { responses, events } = schema;
  const guard = and(
    eq(responses.eventId, eventId),
    isNull(responses.paidAt),
    sql`EXISTS (SELECT 1 FROM ${events} WHERE ${events.id} = ${eventId} AND ${events.stage} = 'rsvp')`
  );
  const writes: BatchItem<'pg'>[] = [useDb().select({ id: events.id }).from(events).where(eq(events.id, eventId)).for('update')];
  // One statement per guest count and sponsor amount; someone already going with as many guests keeps their queue spot.
  const sponsorOf = (a: { sponsor?: number | null }) => a.sponsor || null;
  const groups = new Set(r.going.map((a) => `${a.guests}:${sponsorOf(a) ?? ''}`));
  for (const key of groups) {
    const members = r.going.filter((a) => `${a.guests}:${sponsorOf(a) ?? ''}` === key);
    const guests = members[0]!.guests;
    const ids = members.map((a) => a.memberId);
    writes.push(
      useDb()
        .update(responses)
        .set({
          status: 'going',
          guests,
          sponsorAmount: sponsorOf(members[0]!),
          derived: null,
          noShow: false,
          goingAt: sql`CASE WHEN ${responses.status} = 'going' AND ${responses.goingAt} IS NOT NULL AND ${responses.guests} >= ${guests} THEN ${responses.goingAt} ELSE now() END`,
        })
        .where(and(guard, inArray(responses.memberId, ids)))
    );
  }
  for (const [ids, noShow] of [
    [r.noShow, true],
    [r.dropped, false],
  ] as const) {
    if (ids.length) writes.push(useDb().update(responses).set({ ...clear, guests: 0, sponsorAmount: null, status: 'no', noShow }).where(and(guard, inArray(responses.memberId, ids))));
  }
  return writes;
}

/** Reopening to the poll: no-shows had said Going, so they start unanswered rather than as Can't. */
export const clearNoShows = (eventId: number) => {
  const { responses } = schema;
  return useDb()
    .update(responses)
    .set({ status: null, noShow: false })
    .where(and(eq(responses.eventId, eventId), eq(responses.noShow, true), isNull(responses.paidAt)));
};

/**
 * The statements that mark attendance from votes. They only apply while the event is still in `rsvp` with the given
 * date and place (the same batch's event UPDATE has just written them), so a lost race writes nothing.
 * `lock`: unanswered voters who fit; `edit`: rows already derived (fit → going, no fit → held).
 * Eligibility is repeated in SQL so an answer given meanwhile always wins.
 */
export async function attendanceWrites(
  ev: { id: number; reconfirmBy: Date | null },
  plan: Plan,
  mode: 'lock' | 'edit',
  next: { startsAt: Date | null; venue: string | null }
) {
  const { responses, events } = schema;
  const rows = await useDb().select().from(responses).where(eq(responses.eventId, ev.id));
  const d = deriveAttendance(rows, plan, mode, ev);
  const guard: SQL = sql`EXISTS (SELECT 1 FROM ${events} WHERE ${events.id} = ${ev.id} AND ${events.stage} = 'rsvp' AND ${events.startsAt} IS NOT DISTINCT FROM ${next.startsAt} AND ${events.venue} IS NOT DISTINCT FROM ${next.venue})`;
  const eligible = (ids: number[]) =>
    and(eq(responses.eventId, ev.id), inArray(responses.memberId, ids), isNull(responses.paidAt), mode === 'lock' ? isNull(responses.status) : isNotNull(responses.derived), guard);
  const writes = [];
  if (d.going.length) {
    writes.push(
      useDb()
        .update(responses)
        .set({
          status: 'going',
          derived: 'going',
          // An answer already derived (a seat held in time) keeps its spot.
          goingAt: sql`CASE WHEN ${responses.derived} IS NOT NULL THEN ${responses.goingAt} ELSE COALESCE(${responses.firstVotedAt}, now()) END`,
        })
        .where(eligible(d.going.map((r) => r.memberId)))
    );
  }
  if (d.hold.length) {
    writes.push(useDb().update(responses).set({ derived: 'reconfirm' }).where(eligible(d.hold.map((r) => r.memberId))));
  }
  return { writes, holds: d.hold.length };
}
