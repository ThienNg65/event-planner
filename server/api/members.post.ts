import { randomBytes } from 'node:crypto';

/** Adds a member and signs this browser in as them. */
export default defineEventHandler(async (event) => {
  const name = clean((await readJson(event)).name, 50).replace(/\s+/g, ' ');
  if (!name) fail(400, 'nameRequired');
  const token = randomBytes(32).toString('base64url');
  const [member] = await useDb()
    .insert(schema.members)
    .values({ name, tokenHash: sha256(token) })
    .onConflictDoNothing()
    .returning({ id: schema.members.id, name: schema.members.name });
  if (!member) fail(409, 'nameTaken');
  setSession(event, token);
  setResponseStatus(event, 201);
  return member;
});
