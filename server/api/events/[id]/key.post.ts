import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

/**
 * Replaces the manage key: the old manage link stops working. The plain key is returned once, only its hash is stored.
 * Needs the current manage key itself, not just the host role: a stolen creator sign-in link must not be able to lock the host out.
 */
export default defineEventHandler(async (event) => {
  const ev = await findEvent(routeId(event));
  requireCan(await roleOf(event, ev), 'rotateKey');
  if (!hashMatches(getHeader(event, 'x-manage-key') ?? '', ev.manageKeyHash)) fail(403, 'manageKeyRequired');
  const key = randomBytes(32).toString('base64url');
  // Guarded on the key the host just proved, so two simultaneous rotations can't both succeed.
  const done = await useDb()
    .update(schema.events)
    .set({ manageKeyHash: sha256(key) })
    .where(and(eq(schema.events.id, ev.id), eq(schema.events.manageKeyHash, ev.manageKeyHash)))
    .returning({ id: schema.events.id });
  if (!done.length) fail(409, 'keyChanged');
  return { key };
});
