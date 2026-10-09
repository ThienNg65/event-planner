export default defineEventHandler(async (event) => {
  const name = clean((await readJson(event)).name, 50).replace(/\s+/g, ' ');
  if (!name) fail(400, 'nameRequired');
  const [member] = await useDb()
    .insert(schema.members)
    .values({ name })
    .onConflictDoNothing()
    .returning({ id: schema.members.id, name: schema.members.name });
  if (!member) fail(409, 'nameTaken');
  setResponseStatus(event, 201);
  return member;
});
