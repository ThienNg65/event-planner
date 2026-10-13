import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';

/** Signs this browser in as a member nobody has claimed yet. The conditional UPDATE lets only the first claim win. */
export default defineEventHandler(async (event) => {
  const { members } = schema;
  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id) || id < 1) fail(400, 'unknownMember');
  const token = randomBytes(32).toString('base64url');
  const [member] = await useDb()
    .update(members)
    .set({ tokenHash: sha256(token) })
    .where(and(eq(members.id, id), isNull(members.tokenHash)))
    .returning({ id: members.id, name: members.name });
  if (!member) fail(409, 'nameClaimed');
  setSession(event, token);
  return member;
});
