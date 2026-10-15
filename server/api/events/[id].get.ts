import { and, asc, desc, eq, getTableColumns, gt, lt, sql } from 'drizzle-orm';

/** The events before and after this one in its series, and when the series started (the anchor of the monthly day). */
async function seriesLinks(seriesId: number, startsAt: Date) {
  const { events } = schema;
  const one = (where: ReturnType<typeof and>, order: ReturnType<typeof asc>) =>
    useDb().select({ id: events.id, startsAt: events.startsAt }).from(events).where(where).orderBy(order).limit(1);
  const [[prev], [next], [first]] = await Promise.all([
    one(and(eq(events.seriesId, seriesId), lt(events.startsAt, startsAt)), desc(events.startsAt)),
    one(and(eq(events.seriesId, seriesId), gt(events.startsAt, startsAt)), asc(events.startsAt)),
    one(eq(events.seriesId, seriesId), asc(events.startsAt)),
  ]);
  return { prev: prev ?? null, next: next ?? null, firstAt: first?.startsAt ?? startsAt };
}

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
  let [{ manageKeyHash, coHostKeyHash, handoverTo, handoverAt, ...ev }, rs, vs, [host], co, me] = await Promise.all([
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
      .select({ memberId: cohosts.memberId, name: members.name, status: cohosts.status, invitedAt: cohosts.invitedAt, hasPin: sql<boolean>`${members.pinHash} is not null` })
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
  const series = ev.seriesId === null || !ev.startsAt ? null : await seriesLinks(ev.seriesId, ev.startsAt);
  // Opening the joining link signed in makes you a participant: an empty answer row ("no reply yet"). Crawlers carry no session, so they never join.
  let joinedNow = false;
  if (me !== null && !joined && sameKey(getHeader(event, 'x-join-key'), ev.joinKey)) {
    joinedNow = (await useDb().insert(responses).values({ eventId: id, memberId: me }).onConflictDoNothing().returning()).length > 0;
    if (joinedNow) rs = await answers();
  }
  const { confirmed, waitlist, seats } = rollCall(seated(rs, ev), ev.capacity);
  // A day or place stored as both yes and "if need be" reads as yes.
  rs = rs.map((r) => ({ ...r, maybeDays: r.maybeDays.filter((d) => !r.days.includes(d)), maybeVenueIds: r.maybeVenueIds.filter((v) => !r.venueIds.includes(v)) }));
  let venueList = vs
    .map((v) => ({
      ...v,
      upvotes: rs.filter((r) => r.venueIds.includes(v.id)).map((r) => r.memberId),
      maybe: rs.filter((r) => r.maybeVenueIds.includes(v.id)).map((r) => r.memberId),
    }))
    .sort((a, b) => b.upvotes.length - a.upvotes.length || b.maybe.length - a.maybe.length);
  // `voted` is read from the real rows, so a hidden poll still shows who has answered.
  let shown = rs.map((r) => ({ ...r, voted: hasVoted(r) }));
  const votesHidden = hidesVotes(ev, role, rs, me);
  if (votesHidden) ({ rows: shown, venues: venueList } = redactVotes(shown, venueList, me, ev.honorees));
  // The handover offer is for its two parties only: the signed-in creator (who can withdraw it) and the offered co-host (who can accept).
  const target = handoverTo === null ? undefined : co.find((c) => c.memberId === handoverTo);
  const handover = me !== null && target && (me === ev.createdBy || me === handoverTo) ? { to: target.memberId, name: target.name, at: handoverAt, mine: me === handoverTo } : null;
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
    series,
    handover,
    // Co-hosts the creator may offer the event to (active, with a PIN); empty for everyone else.
    handoverOptions: me !== null && me === ev.createdBy && !ev.cancelledAt ? co.filter((c) => c.status === 'active' && c.hasPin).map((c) => ({ memberId: c.memberId, name: c.name })) : [],
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
