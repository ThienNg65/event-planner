import { randomBytes } from 'node:crypto';
import { and, isNotNull, isNull, sql } from 'drizzle-orm';

/** Adds a member with a sign-in PIN and signs this browser in as them. */
export default defineEventHandler(async (event) => {
  const body = await readJson(event);
  const name = clean(body.name, 50).replace(/\s+/g, ' ');
  if (!name) fail(400, 'nameRequired');
  const pinHash = await hashPin(requirePin(body.pin));
  const token = randomBytes(32).toString('base64url');
  const [member] = await useDb()
    .insert(schema.members)
    .values({ name, tokenHash: sha256(token), pinHash })
    // An archived name nobody ever claimed (and that hosts nothing) is free again: adding it brings the member back.
    .onConflictDoUpdate({
      target: schema.members.name,
      set: { tokenHash: sha256(token), pinHash, archivedAt: null },
      where: and(
        isNull(schema.members.tokenHash),
        isNull(schema.members.pinHash),
        isNotNull(schema.members.archivedAt),
        sql`not ${organizes(schema.members.id)}`
      ),
    })
    .returning({ id: schema.members.id, name: schema.members.name });
  if (!member) fail(409, 'nameTaken');
  setSession(event, token);
  setResponseStatus(event, 201);
  return member;
});
