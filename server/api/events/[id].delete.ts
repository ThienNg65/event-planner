import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const ev = await findEvent(routeId(event));
  if (!isManager(event, ev.manageKeyHash)) fail(403, 'forbidden');
  await useDb().delete(schema.events).where(eq(schema.events.id, ev.id));
  return { ok: true };
});
