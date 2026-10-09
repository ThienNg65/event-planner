export default defineEventHandler(async (event) => {
  const ev = await findEvent(routeId(event));
  if (ev.stage !== 'poll' || ev.venue) fail(409, 'stageClosed');
  const b = await readJson(event);
  const member = await requireMember(b.addedBy);
  const name = clean(b.name, 100);
  const link = clean(b.link, 500);
  const note = clean(b.note, 300);
  if (!name) fail(400, 'nameRequired');
  if (link && !isHttpUrl(link)) fail(400, 'invalidLink');
  const [venue] = await useDb()
    .insert(schema.venues)
    .values({ eventId: ev.id, name, link, note, addedBy: member.id })
    .returning();
  setResponseStatus(event, 201);
  return venue;
});
