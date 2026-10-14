import { eq } from 'drizzle-orm';

/** Sets or changes the signed-in member's PIN (being signed in is the proof, so there is no "old PIN"). */
export default defineEventHandler(async (event) => {
  const me = await meOf(event);
  if (me === null) fail(401, 'signInFirst');
  const pinHash = await hashPin(requirePin((await readJson(event)).pin));
  await useDb().update(schema.members).set({ pinHash, pinFails: 0, pinLockedUntil: null }).where(eq(schema.members.id, me));
  return { ok: true };
});
