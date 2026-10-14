import { and, eq, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';

/**
 * Signs this browser in as a member with their PIN. A guess is counted before the PIN is checked, in one atomic UPDATE,
 * so parallel guesses can't slip past the limit: after PIN_MAX_FAILS wrong PINs the name is locked for PIN_LOCK_MS.
 * An unknown name, a name without a PIN and a wrong PIN all answer `pinWrong`, so the roster can't be probed.
 */
export default defineEventHandler(async (event) => {
  const { members } = schema;
  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id) || id < 1) fail(400, 'unknownMember');
  const pin = clean((await readJson(event)).pin, 20);
  if (pinProblem(pin) === 'format') fail(401, 'pinWrong');
  const atLimit = sql`${members.pinFails} >= ${PIN_MAX_FAILS - 1}`;
  const [row] = await useDb()
    .update(members)
    .set({
      pinFails: sql`case when ${atLimit} then 0 else ${members.pinFails} + 1 end`,
      pinLockedUntil: sql`case when ${atLimit} then now() + make_interval(secs => ${PIN_LOCK_MS / 1000}) else ${members.pinLockedUntil} end`,
    })
    .where(and(eq(members.id, id), isNotNull(members.pinHash), or(isNull(members.pinLockedUntil), lte(members.pinLockedUntil, sql`now()`))))
    .returning({ id: members.id, name: members.name, pinHash: members.pinHash });
  if (!row) {
    const [m] = await useDb().select({ until: members.pinLockedUntil }).from(members).where(eq(members.id, id));
    if (m?.until && m.until > new Date()) fail(429, 'pinLocked');
    fail(401, 'pinWrong');
  }
  if (!(await pinMatches(pin, row.pinHash!))) fail(401, 'pinWrong');
  // A good PIN clears the count and brings an archived member back to the roster.
  await useDb().update(members).set({ pinFails: 0, pinLockedUntil: null, archivedAt: null }).where(eq(members.id, id));
  await startSession(event, id);
  return { id: row.id, name: row.name };
});
