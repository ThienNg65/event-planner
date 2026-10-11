import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const ev = await findEvent(routeId(event));
  const role = roleOf(event, ev);
  const b = await readJson(event);
  const member = await requireMember(b.addedBy);
  requireSelf(event, member.id, role);
  requireVoting(ev, role);
  if (ev.venue) fail(409, 'stageClosed');
  const name = clean(b.name, 100);
  const link = clean(b.link, 500);
  const note = clean(b.note, 300);
  if (!name) fail(400, 'nameRequired');
  if (link && !isHttpUrl(link)) fail(400, 'invalidLink');
  // ponytail: app-level dedupe, a race can still insert twice; add a normalized unique index if it happens.
  const known = await useDb().select().from(schema.venues).where(eq(schema.venues.eventId, ev.id));
  const same = known.find((v) => norm(v.name) === norm(name));
  if (same) throw createError({ statusCode: 409, statusMessage: 'venueExists', data: { id: same.id } });
  const [venue] = await useDb()
    .insert(schema.venues)
    .values({ eventId: ev.id, name, link, note, addedBy: member.id })
    .returning();
  setResponseStatus(event, 201);
  return venue;
});
