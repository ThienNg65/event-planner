import { and, eq, sql } from 'drizzle-orm';

const MAX_DAYS = 20; // same cap as eventFields

export default defineEventHandler(async (event) => {
  const { events, responses } = schema;
  const ev = await findEvent(routeId(event));
  const role = roleOf(event, ev);
  const b = await readJson(event);
  const member = await requireMember(b.memberId);
  requireSelf(event, member.id, role);
  requireVoting(ev, role);
  const day = b.day;
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10); // team time (UTC+7)
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day)) || day < today) fail(400, 'invalidDays');
  // A fixed-date event has no day poll to add to.
  if (!ev.pollDays.length) fail(409, 'stageClosed');
  const exists = ev.pollDays.includes(day);
  if (!exists && ev.pollDays.length >= MAX_DAYS) fail(409, 'tooManyDays');

  // The new day and the suggester's vote for it land together (or the day was already there and only the vote is added).
  const vote = useDb()
    .insert(responses)
    .values({ eventId: ev.id, memberId: member.id, days: [day] })
    .onConflictDoUpdate({
      target: [responses.eventId, responses.memberId],
      set: { days: sql`ARRAY(SELECT DISTINCT d FROM unnest(${responses.days} || ${day}::date) AS d ORDER BY d)` },
    });
  if (exists) await vote;
  else {
    const add = useDb()
      .update(events)
      .set({ pollDays: sql`ARRAY(SELECT DISTINCT d FROM unnest(${events.pollDays} || ${day}::date) AS d ORDER BY d)` })
      .where(and(eq(events.id, ev.id), sql`cardinality(${events.pollDays}) < ${MAX_DAYS}`));
    await useDb().batch([add, vote]);
  }
  return { ok: true };
});
