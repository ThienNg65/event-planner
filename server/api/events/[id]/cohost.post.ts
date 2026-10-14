import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';

/** Creates or rotates the co-host key; the plain key is returned once, only its hash is stored. */
export default defineEventHandler(async (event) => {
  const ev = await findEvent(routeId(event));
  const role = await roleOf(event, ev);
  await requireAccess(event, ev, role);
  requireCan(role, 'cohost');
  const key = randomBytes(32).toString('base64url');
  await useDb().update(schema.events).set({ coHostKeyHash: sha256(key) }).where(eq(schema.events.id, ev.id));
  return { key };
});
