import { asc, eq, getTableColumns } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const { events, responses, members, venues, cohosts } = schema;
  const id = routeId(event);
  // One round trip to the database: every list is keyed by the route id, so none waits for the event row.
  const [{ manageKeyHash, coHostKeyHash, ...ev }, rs, vs, [host], co] = await Promise.all([
    findEvent(id),
    useDb()
      .select({ ...getTableColumns(responses), name: members.name })
      .from(responses)
      .innerJoin(members, eq(members.id, responses.memberId))
      .where(eq(responses.eventId, id))
      .orderBy(asc(members.name)),
    useDb()
      .select({ ...getTableColumns(venues), addedByName: members.name })
      .from(venues)
      .innerJoin(members, eq(members.id, venues.addedBy))
      .where(eq(venues.eventId, id))
      .orderBy(asc(venues.createdAt)),
    useDb().select({ name: members.name }).from(members).innerJoin(events, eq(events.createdBy, members.id)).where(eq(events.id, id)),
    useDb()
      .select({ memberId: cohosts.memberId, name: members.name, status: cohosts.status, invitedAt: cohosts.invitedAt })
      .from(cohosts)
      .innerJoin(members, eq(members.id, cohosts.memberId))
      .where(eq(cohosts.eventId, id))
      .orderBy(asc(cohosts.invitedAt)),
  ]);
  const role = await roleOf(event, { id, manageKeyHash, coHostKeyHash });
  const { confirmed, waitlist, seats } = rollCall(seated(rs, ev), ev.capacity);
  const venueList = vs
    .map((v) => ({ ...v, upvotes: rs.filter((r) => r.venueIds.includes(v.id)).map((r) => r.memberId) }))
    .sort((a, b) => b.upvotes.length - a.upvotes.length);
  return {
    event: ev,
    role,
    manager: role !== null,
    hasCoHost: !!coHostKeyHash,
    // Active co-hosts are public; pending and expired invites are for organizers only.
    cohosts: co
      .filter((c) => c.status === 'active' || role !== null)
      .map((c) => ({
        memberId: c.memberId,
        name: c.name,
        invitedAt: c.invitedAt,
        status: c.status === 'invited' && Date.now() - c.invitedAt.getTime() > INVITE_TTL_MS ? ('expired' as const) : c.status,
      })),
    hostName: host?.name ?? '',
    votingOpen: votingOpen(ev),
    responses: rs,
    confirmed: confirmed.map((r) => r.memberId),
    waitlist: waitlist.map((r) => r.memberId),
    // Seats held after a plan change that are still waiting for their owner to confirm.
    held: rs.filter((r) => r.derived === 'reconfirm' && heldOk(ev)).map((r) => r.memberId),
    seats,
    share: shareOf(ev.billTotal, seats),
    venues: venueList,
  };
});
