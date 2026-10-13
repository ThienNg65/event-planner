import { randomBytes } from 'node:crypto';
import { and, isNotNull, isNull, sql } from 'drizzle-orm';

/** Adds a member and signs this browser in as them. */
export default defineEventHandler(async (event) => {
  const name = clean((await readJson(event)).name, 50).replace(/\s+/g, ' ');
  if (!name) fail(400, 'nameRequired');
  const token = randomBytes(32).toString('base64url');
  const [member] = await useDb()
    .insert(schema.members)
    .values({ name, tokenHash: sha256(token) })
    // An archived name nobody ever claimed (and that hosts nothing) is free again: adding it brings the member back.
    .onConflictDoUpdate({
      target: schema.members.name,
      set: { tokenHash: sha256(token), archivedAt: null },
      where: and(isNull(schema.members.tokenHash), isNotNull(schema.members.archivedAt), sql`not ${organizes(schema.members.id)}`),
    })
    .returning({ id: schema.members.id, name: schema.members.name });
  if (!member) fail(409, 'nameTaken');
  setSession(event, token);
  setResponseStatus(event, 201);
  return member;
});
