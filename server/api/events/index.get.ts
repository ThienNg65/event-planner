import { desc, eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const { events, responses } = schema;
  // The visitor's picked name (cookie set by useMe); no cookie → no personal status.
  const meId = meOf(event);
  const [evs, going, mine] = await Promise.all([
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
        billTotal: events.billTotal,
        voteDeadline: events.voteDeadline,
        cancelledAt: events.cancelledAt,
        reconfirmBy: events.reconfirmBy,
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
    meId ? useDb().select().from(responses).where(eq(responses.memberId, meId)) : [],
  ]);
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
      allPaid: allPaid(confirmed, share),
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
