import { asc, eq, getTableColumns } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const { events, responses, members, venues, cohosts } = schema;
  const id = routeId(event);
  // One round trip to the database: every list is keyed by the route id, so none waits for the event row.
  const answers = () =>
    useDb()
      .select({ ...getTableColumns(responses), name: members.name, archivedAt: members.archivedAt })
      .from(responses)
      .innerJoin(members, eq(members.id, responses.memberId))
      .where(eq(responses.eventId, id))
      .orderBy(asc(members.name));
  let [{ manageKeyHash, coHostKeyHash, ...ev }, rs, vs, [host], co, me] = await Promise.all([
    findEvent(id),
    answers(),
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
    // Warms the per-request session lookup that roleOf needs, so it doesn't wait for the lists.
    meOf(event),
  ]);
  const role = await roleOf(event, { id, createdBy: ev.createdBy, manageKeyHash, coHostKeyHash });
  const joined = me !== null && rs.some((r) => r.memberId === me);
  await requireAccess(event, ev, role, joined);
  // Opening the joining link signed in makes you a participant: an empty answer row ("no reply yet"). Crawlers carry no session, so they never join.
  let joinedNow = false;
  if (me !== null && !joined && sameKey(getHeader(event, 'x-join-key'), ev.joinKey)) {
    joinedNow = (await useDb().insert(responses).values({ eventId: id, memberId: me }).onConflictDoNothing().returning()).length > 0;
    if (joinedNow) rs = await answers();
  }
  const { confirmed, waitlist, seats } = rollCall(seated(rs, ev), ev.capacity);
  let venueList = vs
    .map((v) => ({ ...v, upvotes: rs.filter((r) => r.venueIds.includes(v.id)).map((r) => r.memberId) }))
    .sort((a, b) => b.upvotes.length - a.upvotes.length);
  // `voted` is read from the real rows, so a hidden poll still shows who has answered.
  let shown = rs.map((r) => ({ ...r, voted: hasVoted(r) }));
  const votesHidden = hidesVotes(ev, role, rs, me);
  if (votesHidden) ({ rows: shown, venues: venueList } = redactVotes(shown, venueList, me, ev.honorees));
  return {
    event: ev,
    role,
    manager: role !== null,
    // The manage key this browser sent still opens the host role (a creator's other devices may hold a rotated-out one).
    hostKey: hashMatches(getHeader(event, 'x-manage-key') ?? '', manageKeyHash),
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
    joinedNow,
    // Archived members stay out of the roster counts, like the team list.
    participants: rs.filter((r) => !r.archivedAt).map((r) => ({ id: r.memberId, name: r.name })),
    responses: shown,
    votesHidden,
    confirmed: confirmed.map((r) => r.memberId),
    waitlist: waitlist.map((r) => r.memberId),
    // Seats held after a plan change that are still waiting for their owner to confirm.
    held: rs.filter((r) => r.derived === 'reconfirm' && heldOk(ev)).map((r) => r.memberId),
    seats,
    share: shareOf(ev.billTotal, seats),
    venues: venueList,
  };
});
