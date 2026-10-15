import { and, eq, sql } from 'drizzle-orm';

/**
 * The signed-in creator offers the event to one of its active co-hosts who has a PIN. One offer at a time: a new one
 * replaces the old. The eligibility check is inside the UPDATE, so a co-host removed a moment ago can't be offered.
 */
export default defineEventHandler(async (event) => {
  const { events, cohosts, members } = schema;
  const ev = await findEvent(routeId(event));
  const role = await roleOf(event, ev);
  await requireAccess(event, ev, role);
  requireCan(role, 'handover');
  const me = await meOf(event);
  if (me !== ev.createdBy) fail(403, 'creatorOnly');
  if (ev.cancelledAt) fail(409, 'cancelled');
  const to = (await readJson(event)).to;
  if (!Number.isInteger(to) || to === me) fail(400, 'unknownMember');

  const done = await useDb()
    .update(events)
    .set({ handoverTo: to as number, handoverAt: new Date() })
    .where(
      and(
        eq(events.id, ev.id),
        eq(events.createdBy, me),
        sql`exists (select 1 from ${cohosts} where ${cohosts.eventId} = ${events.id} and ${cohosts.memberId} = ${to} and ${cohosts.status} = 'active')`,
        sql`exists (select 1 from ${members} where ${members.id} = ${to} and ${members.pinHash} is not null)`
      )
    )
    .returning({ id: events.id });
  if (!done.length) fail(409, 'handoverTarget');
  return { ok: true };
});
