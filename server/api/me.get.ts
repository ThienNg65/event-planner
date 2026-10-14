import { sql } from 'drizzle-orm';

/** The signed-in member, or null. `organizer`: has created an event, so may archive leftover members. `hasPin`: a PIN is set. One query. */
export default defineEventHandler(async (event) => {
  const token = sessionToken(event);
  if (!token) return null;
  const { members } = schema;
  const [m] = await useDb()
    .select({ id: members.id, name: members.name, organizer: organizes(members.id).mapWith(Boolean), hasPin: sql<boolean>`${members.pinHash} is not null` })
    .from(members)
    .where(tokenMatches(token));
  return m ?? null;
});
