import { isNotNull, isNull, or } from 'drizzle-orm';

// `claimed`: the name can't be taken without a credential, because someone signed in as it, it has a PIN, or it created an event.
// `hasPin`: the name can be signed into with its PIN. Archived members are left out.
export default defineEventHandler(() =>
  useDb()
    .select({
      id: schema.members.id,
      name: schema.members.name,
      claimed: or(isNotNull(schema.members.tokenHash), isNotNull(schema.members.pinHash), organizes(schema.members.id))!.mapWith(Boolean),
      hasPin: isNotNull(schema.members.pinHash).mapWith(Boolean),
    })
    .from(schema.members)
    .where(isNull(schema.members.archivedAt))
    .orderBy(schema.members.name)
);
