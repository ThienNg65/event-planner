import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const ev = await findEvent(routeId(event));
  requireCan(roleOf(event, ev), 'cohost');
  await useDb().update(schema.events).set({ coHostKeyHash: null }).where(eq(schema.events.id, ev.id));
  return { ok: true };
});
