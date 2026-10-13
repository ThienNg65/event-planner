import { randomBytes } from 'node:crypto';

export default defineEventHandler(async (event) => {
  const b = await readJson(event);
  const { stage: _ignored, reconfirmBy: _held, ...f } = eventFields({ title: '', ...b });
  const createdBy = await meOf(event);
  if (createdBy === null) fail(401, 'signInFirst');
  const pollDays = f.pollDays ?? [];
  if (!pollDays.length && !f.startsAt) fail(400, 'invalidDate');

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
  setResponseStatus(event, 201);
  return { id: ev!.id, key };
});
