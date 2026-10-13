import { isNotNull, or } from 'drizzle-orm';

// `claimed`: the name can't be picked from the list, because someone signed in as it or it created an event.
export default defineEventHandler(() =>
  useDb()
    .select({ id: schema.members.id, name: schema.members.name, claimed: or(isNotNull(schema.members.tokenHash), organizes(schema.members.id))!.mapWith(Boolean) })
    .from(schema.members)
    .orderBy(schema.members.name)
);
