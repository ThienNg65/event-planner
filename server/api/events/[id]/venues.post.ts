import { eq } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  const ev = await findEvent(routeId(event));
  const role = await roleOf(event, ev);
  await requireAccess(event, ev, role);
  const b = await readJson(event);
  const member = await requireMember(b.addedBy);
  await requireSelf(event, member.id, role);
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
  // The event-row lock serializes this with votes for places (PUT /response) and with place removal.
  const lock = useDb().select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.id, ev.id)).for('update');
  const insert = useDb().insert(schema.venues).values({ eventId: ev.id, name, link, note, addedBy: member.id }).returning();
  const [, [venue]] = await useDb().batch([lock, insert]);
  setResponseStatus(event, 201);
  return venue;
});
