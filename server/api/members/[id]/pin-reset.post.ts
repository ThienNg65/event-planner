import { and, eq, sql } from 'drizzle-orm';

/**
 * An organizer gives a member who lost their PIN (or their phone) a new random one, shown once to pass on. The member is
 * signed out everywhere, old sign-in link included. A member who organizes events can't be reset this way: it would hand
 * their hosting rights to any other organizer.
 */
export default defineEventHandler(async (event) => {
  const { members, memberSessions } = schema;
  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id) || id < 1) fail(400, 'unknownMember');
  const me = await meOf(event);
  if (me === null) fail(401, 'signInFirst');
  const [mine] = await useDb().select({ host: organizes(me).mapWith(Boolean) }).from(members).where(eq(members.id, me));
  if (!mine?.host) fail(403, 'organizersOnly');
  const pin = randomPin();
  // One batch with the sign-out, so a sign-out-others landing in between can't leave a session that survives the reset.
  const db = useDb();
  const [done] = await db.batch([
    db
      .update(members)
      .set({ pinHash: await hashPin(pin), pinFails: 0, pinLockedUntil: null, tokenHash: null })
      .where(and(eq(members.id, id), sql`not ${organizes(id)}`))
      .returning({ id: members.id }),
    db.delete(memberSessions).where(and(eq(memberSessions.memberId, id), sql`not ${organizes(id)}`)),
  ]);
  if (!done.length) {
    const [m] = await db.select({ id: members.id }).from(members).where(eq(members.id, id));
    fail(m ? 403 : 404, m ? 'pinResetOrganizer' : 'unknownMember');
  }
  return { pin };
});
