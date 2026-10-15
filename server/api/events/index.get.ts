import { and, count, desc, eq, inArray, or, sql } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const { events, responses, cohosts } = schema;
  const meId = await meOf(event);
  // Events are private: signed out, there is nothing to list (the home page shows the sign-in card).
  if (!meId) return [];
  // Mine = I have an answer row (joined, or organizer: rows are added on create and on co-host accept) or I created it.
  // shortcut: sequential scan on responses.member_id, fine at team size; add an index on responses(member_id) if the table grows.
  const myEventIds = useDb().select({ id: responses.eventId }).from(responses).where(eq(responses.memberId, meId));
  const [evs, going, answered, { mine, cohosting }] = await Promise.all([
    useDb()
      .select({
        id: events.id,
        title: events.title,
        stage: events.stage,
        pollDays: events.pollDays,
        startsAt: events.startsAt,
        venue: events.venue,
        capacity: events.capacity,
        plannedCapacity: events.plannedCapacity,
        cover: events.cover,
        theme: events.theme,
        billTotal: events.billTotal,
        voteDeadline: events.voteDeadline,
        cancelledAt: events.cancelledAt,
        reconfirmBy: events.reconfirmBy,
        createdBy: events.createdBy,
      })
      .from(events)
      .where(or(eq(events.createdBy, meId), inArray(events.id, myEventIds)))
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
      .where(and(eq(responses.status, 'going'), inArray(responses.eventId, myEventIds))),
    // Who has answered, per event: a day, a place, or can't join (the same rule as pendingVoters).
    useDb()
      .select({ eventId: responses.eventId, n: count() })
      .from(responses)
      .where(
        and(
          or(sql`cardinality(${responses.days}) > 0`, sql`cardinality(${responses.venueIds}) > 0`, eq(responses.status, 'no')),
          inArray(responses.eventId, myEventIds)
        )
      )
      .groupBy(responses.eventId),
    (async () => {
      const [mine, cohosting] = await Promise.all([
        useDb().select().from(responses).where(eq(responses.memberId, meId)),
        useDb()
          .select({ eventId: cohosts.eventId })
          .from(cohosts)
          .where(and(eq(cohosts.memberId, meId), eq(cohosts.status, 'active'))),
      ]);
      return { mine, cohosting };
    })(),
  ]);
  const answeredBy = new Map(answered.map((a) => [a.eventId, a.n]));
  // ponytail: loads the "going" rows of my events to count seats; fine for a team, add a per-event SQL sum if it grows.
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
      manager: e.createdBy === meId || cohosting.some((c) => c.eventId === e.id),
      mine: mineOf(
        row,
        confirmed.some((r) => r.memberId === meId),
        waitlist.some((r) => r.memberId === meId),
        share,
        row?.derived === 'reconfirm' && heldOk(e)
      ),
    };
  });
});
