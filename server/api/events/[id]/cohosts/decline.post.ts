import { and, eq } from 'drizzle-orm';

/** The invitee turns the invite down: the pending row is removed and the link is dead. */
export default defineEventHandler(async (event) => {
  const { cohosts } = schema;
  const ev = await findEvent(routeId(event));
  const row = await inviteRow(ev.id, await readJson(event));
  await useDb().delete(cohosts).where(and(eq(cohosts.eventId, ev.id), eq(cohosts.memberId, row.memberId), eq(cohosts.inviteHash, sha256(row.invite))));
  return { ok: true };
});
