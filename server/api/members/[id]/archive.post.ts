import { eq } from 'drizzle-orm';

/**
 * Hides a member from the roster and the "no reply yet" lists (leftover and test names). Nothing is deleted:
 * a claimed member comes back by opening their sign-in link, an unclaimed one when someone adds the name again.
 * Members are team-wide while roles are per event, so anyone who has created an event may tidy the roster.
 */
export default defineEventHandler(async (event) => {
  const { members } = schema;
  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id) || id < 1) fail(400, 'unknownMember');
  const me = await meOf(event);
  if (me === null) fail(401, 'signInFirst');
  const [mine] = await useDb().select({ host: organizes(me).mapWith(Boolean) }).from(members).where(eq(members.id, me));
  if (!mine?.host) fail(403, 'organizersOnly');
  const [done] = await useDb().update(members).set({ archivedAt: new Date() }).where(eq(members.id, id)).returning({ id: members.id });
  if (!done) fail(404, 'unknownMember');
  return { ok: true };
});
