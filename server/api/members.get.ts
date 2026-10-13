import { isNotNull, isNull, or } from 'drizzle-orm';

// `claimed`: the name can't be picked from the list, because someone signed in as it or it created an event. Archived members are left out.
export default defineEventHandler(() =>
  useDb()
    .select({ id: schema.members.id, name: schema.members.name, claimed: or(isNotNull(schema.members.tokenHash), organizes(schema.members.id))!.mapWith(Boolean) })
    .from(schema.members)
    .where(isNull(schema.members.archivedAt))
    .orderBy(schema.members.name)
);
