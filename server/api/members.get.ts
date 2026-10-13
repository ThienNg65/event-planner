export default defineEventHandler(() =>
  useDb()
    .select({ id: schema.members.id, name: schema.members.name })
    .from(schema.members)
    .orderBy(schema.members.name)
);
