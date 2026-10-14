import { eq } from 'drizzle-orm';

/** Sets the signed-in member's first PIN, or changes it: a member who has one must present the current one as `currentPin`. */
export default defineEventHandler(async (event) => {
  const me = await meOf(event);
  if (me === null) fail(401, 'signInFirst');
  const body = await readJson(event);
  const pinHash = await hashPin(requirePin(body.pin));
  await requireCurrentPin(me, body.currentPin);
  await useDb().update(schema.members).set({ pinHash, pinFails: 0, pinLockedUntil: null }).where(eq(schema.members.id, me));
  return { ok: true };
});
