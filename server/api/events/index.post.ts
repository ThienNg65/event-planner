import { randomBytes } from 'node:crypto';

export default defineEventHandler(async (event) => {
  const b = await readJson(event);
  const { stage: _ignored, ...f } = eventFields({ title: '', ...b });
  const creator = await requireMember(b.createdBy);
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
      createdBy: creator.id,
      manageKeyHash: sha256(key),
    })
    .returning({ id: schema.events.id });
  setResponseStatus(event, 201);
  return { id: ev!.id, key };
});
