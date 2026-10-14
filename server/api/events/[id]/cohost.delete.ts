import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const ev = await findEvent(routeId(event));
  const role = await roleOf(event, ev);
  await requireAccess(event, ev, role);
  requireCan(role, 'cohost');
  await useDb().update(schema.events).set({ coHostKeyHash: null }).where(eq(schema.events.id, ev.id));
  return { ok: true };
});
