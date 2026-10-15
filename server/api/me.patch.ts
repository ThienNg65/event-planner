import { eq } from 'drizzle-orm';

/** Renames the signed-in member. The session already proves who they are, so no PIN is asked; the name must stay unique like at sign-up. */
export default defineEventHandler(async (event) => {
  const me = await meOf(event);
  if (me === null) fail(401, 'signInFirst');
  const body = await readJson(event);
  const name = clean(body.name, 50).replace(/\s+/g, ' ');
  if (!name) fail(400, 'nameRequired');
  try {
    await useDb().update(schema.members).set({ name }).where(eq(schema.members.id, me));
  } catch (e) {
    // Postgres unique violation, which the Neon driver may carry on the error or its cause.
    const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    if (code === '23505') fail(409, 'nameTaken');
    throw e;
  }
  return { id: me, name };
});
