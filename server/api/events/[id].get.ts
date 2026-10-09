import { asc, eq, getTableColumns } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const { responses, members, venues } = schema;
  const { manageKeyHash, ...ev } = await findEvent(routeId(event));
  const [rs, vs] = await Promise.all([
    useDb()
      .select({ ...getTableColumns(responses), name: members.name })
      .from(responses)
      .innerJoin(members, eq(members.id, responses.memberId))
      .where(eq(responses.eventId, ev.id))
      .orderBy(asc(members.name)),
    useDb()
      .select({ ...getTableColumns(venues), addedByName: members.name })
      .from(venues)
      .innerJoin(members, eq(members.id, venues.addedBy))
      .where(eq(venues.eventId, ev.id))
      .orderBy(asc(venues.createdAt)),
  ]);
  const { confirmed, waitlist, seats } = rollCall(rs, ev.capacity);
  const venueList = vs
    .map((v) => ({ ...v, upvotes: rs.filter((r) => r.venueIds.includes(v.id)).map((r) => r.memberId) }))
    .sort((a, b) => b.upvotes.length - a.upvotes.length);
  return {
    event: ev,
    manager: isManager(event, manageKeyHash),
    responses: rs,
    confirmed: confirmed.map((r) => r.memberId),
    waitlist: waitlist.map((r) => r.memberId),
    seats,
    share: shareOf(ev.billTotal, seats),
    venues: venueList,
  };
});
