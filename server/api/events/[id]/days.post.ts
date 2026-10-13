import { and, eq, sql } from 'drizzle-orm';

const MAX_DAYS = 20; // same cap as eventFields

export default defineEventHandler(async (event) => {
  const { events, responses } = schema;
  const ev = await findEvent(routeId(event));
  const role = await roleOf(event, ev);
  const b = await readJson(event);
  const member = await requireMember(b.memberId);
  await requireSelf(event, member.id, role);
  requireVoting(ev, role);
  const day = b.day;
  if (!isDay(day) || day < teamToday()) fail(400, 'invalidDays');
  // A fixed-date event has no day poll to add to.
  if (!ev.pollDays.length) fail(409, 'stageClosed');
  const exists = ev.pollDays.includes(day);
  if (!exists && ev.pollDays.length >= MAX_DAYS) fail(409, 'tooManyDays');

  // One batch whose first statement locks the event row: the new day (or a share lock when it already exists) and the
  // suggester's vote land together, and the vote is filtered against the days as they are after the lock.
  const current = currentDays(ev.id);
  const vote = useDb()
    .insert(responses)
    .values({ eventId: ev.id, memberId: member.id, firstVotedAt: sql`now()`, days: sql`ARRAY(SELECT d FROM unnest(ARRAY[${day}::date]) AS d WHERE d = ANY(${current}))` })
    .onConflictDoUpdate({
      target: [responses.eventId, responses.memberId],
      set: {
        firstVotedAt: sql`COALESCE(${responses.firstVotedAt}, now())`,
        days: sql`ARRAY(SELECT DISTINCT d FROM unnest(${responses.days} || ${day}::date) AS d WHERE d = ANY(${current}) ORDER BY d)`,
      },
    })
    .returning({ days: responses.days });
  const lock = exists
    ? useDb().select({ id: events.id }).from(events).where(eq(events.id, ev.id)).for('share')
    : useDb()
        .update(events)
        .set({ pollDays: sql`ARRAY(SELECT DISTINCT d FROM unnest(${events.pollDays} || ${day}::date) AS d ORDER BY d)` })
        .where(and(eq(events.id, ev.id), sql`cardinality(${events.pollDays}) < ${MAX_DAYS}`));
  const [, [saved]] = await useDb().batch([lock, vote]);
  // Not stored: the cap was reached first, or the day was removed since the page loaded.
  if (!saved?.days.includes(day)) fail(409, exists ? 'daysChanged' : 'tooManyDays');
  return { ok: true };
});
