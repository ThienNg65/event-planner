import { and, eq, isNotNull } from 'drizzle-orm';

/** Signs this browser in from a sign-in link opened on another device. */
export default defineEventHandler(async (event) => {
  const token = clean((await readJson(event)).token, 100);
  const m = await memberByToken(token || null);
  if (!m) fail(404, 'signInInvalid');
  // Signing in brings an archived member back to the roster.
  await useDb().update(schema.members).set({ archivedAt: null }).where(and(eq(schema.members.id, m.id), isNotNull(schema.members.archivedAt)));
  setSession(event, token);
  return m;
});
