import { and, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';

/** The plan a (next) date and place give; `venues` are the event's polled places. */
export const planOf = (next: { pollDays: string[]; startsAt: Date | null; venue: string | null }, venues: { id: number; name: string }[]) =>
  planFor(next.pollDays, next.startsAt, venues, next.venue);

const clear = { status: null, goingAt: null, derived: null } as const;

/**
 * Releases held seats whose confirm-by deadline has passed. It must run before `reconfirm_by` is rewritten in the same
 * batch: it reads the old deadline, so a new one can never bring an expired hold back.
 */
export const releaseExpired = (eventId: number) => {
  const { responses } = schema;
  return useDb()
    .update(responses)
    .set(clear)
    .where(
      and(
        eq(responses.eventId, eventId),
        eq(responses.derived, 'reconfirm'),
        isNull(responses.paidAt),
        sql`COALESCE((SELECT reconfirm_by FROM events WHERE id = ${eventId}), '-infinity') <= now()`
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
