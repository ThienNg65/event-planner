import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const ev = await findEvent(routeId(event));
  requireCan(roleOf(event, ev), 'delete');
  await useDb().delete(schema.events).where(eq(schema.events.id, ev.id));
  return { ok: true };
});
