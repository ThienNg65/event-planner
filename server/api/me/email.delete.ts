import { eq } from 'drizzle-orm';

/** Removes the member's email (withdrawing consent) and any code in flight. Needs the PIN. */
export default defineEventHandler(async (event) => {
  requireEmailEnabled();
  const me = await meOf(event);
  if (me === null) fail(401, 'signInFirst');
  await requireCurrentPin(me, (await readJson(event)).currentPin);
  const db = useDb();
  await db.batch([db.delete(schema.memberEmail).where(eq(schema.memberEmail.memberId, me)), db.delete(schema.memberCodes).where(eq(schema.memberCodes.memberId, me))]);
  return { ok: true };
});
