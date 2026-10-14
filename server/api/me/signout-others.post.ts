import { randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';

/**
 * Signs the member out on every other device and kills the old sign-in link (it is this browser's own token). This browser
 * gets a fresh token as `members.tokenHash`, which also keeps a member without a PIN claimed. One batch, so a concurrent PIN
 * reset or second call can't leave it half done: the swap only happens while the presented token is still valid, and the
 * sessions are only removed once the swap is in.
 */
export default defineEventHandler(async (event) => {
  const me = await meOf(event);
  const current = sessionToken(event);
  if (me === null || !current) fail(401, 'signInFirst');
  const { members, memberSessions } = schema;
  const db = useDb();
  const token = randomBytes(32).toString('base64url');
  const hash = sha256(token);
  const [swapped] = await db.batch([
    db
      .update(members)
      .set({ tokenHash: hash })
      .where(and(eq(members.id, me), tokenMatches(current)))
      .returning({ id: members.id }),
    db.delete(memberSessions).where(and(eq(memberSessions.memberId, me), sql`exists (select 1 from ${members} where ${members.id} = ${me} and ${members.tokenHash} = ${hash})`)),
  ]);
  if (!swapped.length) fail(409, 'signInInvalid');
  setSession(event, token);
  return { ok: true };
});
