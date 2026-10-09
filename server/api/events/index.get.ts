import { desc, eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const { events, responses } = schema;
  // The visitor's picked name (cookie set by useMe); no cookie → no personal status.
  const me = Number(getCookie(event, 'me'));
  const meId = Number.isInteger(me) && me > 0 ? me : null;
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
      })
      .from(events)
      .orderBy(desc(events.createdAt)),
    useDb()
      .select({
        eventId: responses.eventId,
        memberId: responses.memberId,
        status: responses.status,
        guests: responses.guests,
        goingAt: responses.goingAt,
        paidAt: responses.paidAt,
      })
      .from(responses)
      .where(eq(responses.status, 'going')),
    meId ? useDb().select().from(responses).where(eq(responses.memberId, meId)) : [],
  ]);
  // ponytail: loads every "going" row to count seats; fine for a team, add a per-event SQL sum if it grows.
  return evs.map((e) => {
    const { confirmed, waitlist, seats } = rollCall(
      going.filter((r) => r.eventId === e.id),
      e.capacity
    );
    const row = mine.find((r) => r.eventId === e.id);
    return {
      ...e,
      seats,
      allPaid: confirmed.length > 0 && confirmed.every((r) => r.paidAt),
      mine: meId
        ? mineOf(
            row,
            confirmed.some((r) => r.memberId === meId),
            waitlist.some((r) => r.memberId === meId),
            shareOf(e.billTotal, seats)
          )
        : null,
    };
  });
});
