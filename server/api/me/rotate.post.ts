import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

/** Replaces this member's sign-in token, signing them out on every other device; the leaked old link stops working. */
export default defineEventHandler(async (event) => {
  const me = await meOf(event);
  const current = sessionToken(event);
  if (me === null || !current) fail(401, 'signInFirst');
  const token = randomBytes(32).toString('base64url');
  const { members } = schema;
  const done = await useDb()
    .update(members)
    .set({ tokenHash: sha256(token) })
    .where(and(eq(members.id, me), eq(members.tokenHash, sha256(current))))
    .returning({ id: members.id });
  if (!done.length) fail(409, 'signInInvalid');
  setSession(event, token);
  return { ok: true };
});
