import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

export default defineEventHandler(async (event) => {
  const b = await readJson(event);
  const { stage: _ignored, reconfirmBy: _held, ...f } = eventFields({ title: '', ...b });
  const createdBy = await meOf(event);
  if (createdBy === null) fail(401, 'signInFirst');
  await requireMembers(f.honorees);
  const pollDays = f.pollDays ?? [];
  if (!pollDays.length && !f.startsAt) fail(400, 'invalidDate');
  if (!pollDays.length && f.startsAt! <= new Date()) fail(400, 'startsInPast');

  requireRepeatable({ ...f, pollDays });

  const key = randomBytes(32).toString('base64url');
  const [ev] = await useDb()
    .insert(schema.events)
    .values({
      ...f,
      title: f.title!,
      pollDays,
      startsAt: pollDays.length ? null : f.startsAt,
      // Anything still undecided (days or venue) starts in the poll stage.
      stage: pollDays.length || !f.venue ? 'poll' : 'rsvp',
      createdBy,
      manageKeyHash: sha256(key),
    })
    .returning({ id: schema.events.id });
  // The first event of a series is its own series id.
  if (f.repeat) await useDb().update(schema.events).set({ seriesId: ev!.id }).where(eq(schema.events.id, ev!.id));
  // The organizer is a participant from the start. If this fails, createdBy still grants host and still lists the event.
  await useDb().insert(schema.responses).values({ eventId: ev!.id, memberId: createdBy }).onConflictDoNothing();
  setResponseStatus(event, 201);
  return { id: ev!.id, key };
});
