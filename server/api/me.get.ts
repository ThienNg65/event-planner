import { eq } from 'drizzle-orm';

/** The signed-in member, or null. `organizer`: has created an event, so may archive leftover members. One query. */
export default defineEventHandler(async (event) => {
  const token = sessionToken(event);
  if (!token) return null;
  const { members } = schema;
  const [m] = await useDb()
    .select({ id: members.id, name: members.name, organizer: organizes(members.id).mapWith(Boolean) })
    .from(members)
    .where(eq(members.tokenHash, sha256(token)));
  return m ?? null;
});
