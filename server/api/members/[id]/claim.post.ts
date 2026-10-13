import { randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';

/**
 * Signs this browser in as a member nobody has claimed yet. The conditional UPDATE lets only the first claim win.
 * A name that created an event can't be claimed: whoever picked it would get host rights.
 */
export default defineEventHandler(async (event) => {
  const { members } = schema;
  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id) || id < 1) fail(400, 'unknownMember');
  const token = randomBytes(32).toString('base64url');
  const [member] = await useDb()
    .update(members)
    .set({ tokenHash: sha256(token) })
    .where(and(eq(members.id, id), isNull(members.tokenHash), sql`not ${organizes(id)}`))
    .returning({ id: members.id, name: members.name });
  if (!member) {
    const [row] = await useDb().select({ claimed: sql<boolean>`${members.tokenHash} is not null` }).from(members).where(eq(members.id, id));
    fail(409, row && !row.claimed ? 'nameOrganizer' : 'nameClaimed');
  }
  setSession(event, token);
  return member;
});
