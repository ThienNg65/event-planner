import { eq, sql } from 'drizzle-orm';

/**
 * A member who forgot their PIN asks for a code by email. The answer is always `{ sent: true }`, whether or not the name
 * has a verified address, a cap stopped the mail or sending failed, so the roster can't be probed for who gave an email.
 * The code goes to the verified address, or during the 72-hour cool-down after a change to the previous one.
 * Caps: one code a minute and RECOVER_CODES_PER_MEMBER_DAY a day per member, RECOVER_CODES_GLOBAL_DAY a day overall.
 */
export default defineEventHandler(async (event) => {
  requireEmailEnabled();
  const id = Number(getRouterParam(event, 'id'));
  if (!Number.isInteger(id) || id < 1) fail(400, 'unknownMember');
  // Checked before the lookup, so running out of budget looks the same for every name.
  if (!mailAllowed(await mailsSentToday(), 'code')) fail(429, 'mailBudget');
  const { memberEmail } = schema;
  const [m] = await useDb()
    .select({ to: sql<string>`case when ${memberEmail.prevEmail} is not null and ${memberEmail.recoveryAfter} > now() then ${memberEmail.prevEmail} else ${memberEmail.email} end`, locale: memberEmail.locale })
    .from(memberEmail)
    .where(eq(memberEmail.memberId, id));
  if (!m) return { sent: true };
  const code = newCode();
  if (await storeCode(id, 'recover', m.to, code, RECOVER_CODES_PER_MEMBER_DAY, RECOVER_CODES_GLOBAL_DAY)) {
    await trySendMail({ kind: 'code', to: m.to, template: 'recoverCode', locale: m.locale, params: { code } });
  }
  return { sent: true };
});
