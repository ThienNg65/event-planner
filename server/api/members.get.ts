import { isNotNull } from 'drizzle-orm';

export default defineEventHandler(() =>
  useDb()
    .select({ id: schema.members.id, name: schema.members.name, claimed: isNotNull(schema.members.tokenHash) })
    .from(schema.members)
    .orderBy(schema.members.name)
);
