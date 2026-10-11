import { asc, eq, getTableColumns } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const { responses, members, venues, cohosts } = schema;
  const { manageKeyHash, coHostKeyHash, ...ev } = await findEvent(routeId(event));
  const role = await roleOf(event, { id: ev.id, manageKeyHash, coHostKeyHash });
  const [rs, vs, [host], co] = await Promise.all([
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
    useDb().select({ name: members.name }).from(members).where(eq(members.id, ev.createdBy)),
    useDb()
      .select({ memberId: cohosts.memberId, name: members.name, status: cohosts.status, invitedAt: cohosts.invitedAt })
      .from(cohosts)
      .innerJoin(members, eq(members.id, cohosts.memberId))
      .where(eq(cohosts.eventId, ev.id))
      .orderBy(asc(cohosts.invitedAt)),
  ]);
  const { confirmed, waitlist, seats } = rollCall(rs, ev.capacity);
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
    seats,
    share: shareOf(ev.billTotal, seats),
    venues: venueList,
  };
});
