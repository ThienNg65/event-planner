import { eq, sql } from 'drizzle-orm';

/**
 * Finishes a PIN recovery by email: with the right code the member gets the new PIN they chose and is signed in here and
 * signed out everywhere else (old sign-in link included). Open to organizers too: it hands nothing over, since only the
 * owner of the verified address can use it, and the manage keys are untouched. Every failure answers `codeInvalid`.
 */
export default defineEventHandler(async (event) => {
  requireEmailEnabled();
  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id) || id < 1) fail(400, 'codeInvalid');
  const body = await readJson(event);
  // A badly formed PIN is refused before the code is spent.
  const pinHash = await hashPin(requirePin(body.newPin));
  await consumeCode(id, 'recover', body.code);
  const { members, memberSessions, memberEmail } = schema;
  const db = useDb();
  const [done] = await db.batch([
    db.update(members).set({ pinHash, pinFails: 0, pinLockedUntil: null, tokenHash: null }).where(eq(members.id, id)).returning({ id: members.id, name: members.name }),
    db.delete(memberSessions).where(eq(memberSessions.memberId, id)),
  ]);
  const [member] = done;
  if (!member) fail(400, 'codeInvalid');
  await startSession(event, id);
  const [mail] = await db
    .select({ email: memberEmail.email, prev: sql<string | null>`case when ${memberEmail.recoveryAfter} > now() then ${memberEmail.prevEmail} end`, locale: memberEmail.locale })
    .from(memberEmail)
    .where(eq(memberEmail.memberId, id));
  for (const to of new Set([mail?.email, mail?.prev])) {
    if (to) await trySendMail({ kind: 'notice', to, template: 'pinReset', locale: mail!.locale, params: { name: member.name } });
  }
  return member;
});
