import { and, count, desc, eq, or, sql } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const { events, responses, cohosts } = schema;
  // The signed-in member (looked up alongside the lists); not signed in → no personal status.
  const [evs, going, answered, { meId, mine, cohosting }] = await Promise.all([
    useDb()
      .select({
        id: events.id,
        title: events.title,
        stage: events.stage,
        pollDays: events.pollDays,
        startsAt: events.startsAt,
        venue: events.venue,
        capacity: events.capacity,
        cover: events.cover,
        theme: events.theme,
        billTotal: events.billTotal,
        voteDeadline: events.voteDeadline,
        cancelledAt: events.cancelledAt,
        reconfirmBy: events.reconfirmBy,
        createdBy: events.createdBy,
      })
      .from(events)
      .orderBy(desc(events.createdAt)),
    useDb()
      .select({
        eventId: responses.eventId,
        memberId: responses.memberId,
        status: responses.status,
        derived: responses.derived,
        guests: responses.guests,
        goingAt: responses.goingAt,
        paidAt: responses.paidAt,
        paidAmount: responses.paidAmount,
      })
      .from(responses)
      .where(eq(responses.status, 'going')),
    // Who has answered, per event: a day, a place, or can't join (the same rule as pendingVoters).
    useDb()
      .select({ eventId: responses.eventId, n: count() })
      .from(responses)
      .where(or(sql`cardinality(${responses.days}) > 0`, sql`cardinality(${responses.venueIds}) > 0`, eq(responses.status, 'no')))
      .groupBy(responses.eventId),
    (async () => {
      const meId = await meOf(event);
      if (!meId) return { meId, mine: [], cohosting: [] };
      const [mine, cohosting] = await Promise.all([
        useDb().select().from(responses).where(eq(responses.memberId, meId)),
        useDb()
          .select({ eventId: cohosts.eventId })
          .from(cohosts)
          .where(and(eq(cohosts.memberId, meId), eq(cohosts.status, 'active'))),
      ]);
      return { meId, mine, cohosting };
    })(),
  ]);
  const answeredBy = new Map(answered.map((a) => [a.eventId, a.n]));
  // ponytail: loads every "going" row to count seats; fine for a team, add a per-event SQL sum if it grows.
  return evs.map((e) => {
    const { confirmed, waitlist, seats } = rollCall(
      seated(
        going.filter((r) => r.eventId === e.id),
        e
      ),
      e.capacity
    );
    const share = shareOf(e.billTotal, seats);
    const row = mine.find((r) => r.eventId === e.id);
    return {
      ...e,
      seats,
      answered: answeredBy.get(e.id) ?? 0,
      allPaid: allPaid(confirmed, share),
      // Organizer by identity; the browser adds events whose manage key it holds.
      manager: meId !== null && (e.createdBy === meId || cohosting.some((c) => c.eventId === e.id)),
      mine: meId
        ? mineOf(
            row,
            confirmed.some((r) => r.memberId === meId),
            waitlist.some((r) => r.memberId === meId),
            share,
            row?.derived === 'reconfirm' && heldOk(e)
          )
        : null,
    };
  });
});
