import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const ev = await findEvent(routeId(event));
  if (!isManager(event, ev.manageKeyHash)) fail(403, 'forbidden');
  const f = eventFields(await readJson(event));
  if (!Object.keys(f).length) fail(400, 'invalid');
  const next = { ...ev, ...f };
  // Past the poll stage the event needs a fixed date (that's what "Lock" sets).
  if (next.stage !== 'poll' && !next.startsAt) fail(400, 'invalidDate');
  await useDb().update(schema.events).set(f).where(eq(schema.events.id, ev.id));
  return { ok: true };
});
