import { eq, sql } from 'drizzle-orm';

/**
 * Starts adding or changing the signed-in member's email: mails a six-digit code to the new address. The member must have
 * a PIN and present it as `currentPin`, must tick the consent (`consent: true`) and the address must be on the allowed
 * domains. Nothing is saved until `/api/me/email/verify` confirms the code.
 */
export default defineEventHandler(async (event) => {
  const { domains } = requireEmailEnabled();
  const me = await meOf(event);
  if (me === null) fail(401, 'signInFirst');
  const body = await readJson(event);
  if (body.consent !== true) fail(400, 'consentRequired');
  const email = normalizeEmail(body.email);
  if (!email) fail(400, 'emailInvalid');
  if (!domainAllowed(email, domains)) fail(400, 'emailDomain');
  const { members, memberEmail } = schema;
  const [m] = await useDb()
    .select({ hasPin: sql<boolean>`${members.pinHash} is not null`, current: memberEmail.email })
    .from(members)
    .leftJoin(memberEmail, eq(memberEmail.memberId, members.id))
    .where(eq(members.id, me));
  if (!m?.hasPin) fail(409, 'pinRequired');
  if (m.current === email) fail(409, 'emailSame');
  await requireCurrentPin(me, body.currentPin);
  const code = newCode();
  if (!(await storeCode(me, 'verify', email, code, VERIFY_CODES_PER_DAY))) fail(429, 'emailTooSoon');
  await sendMail({ kind: 'code', to: email, template: 'verifyCode', locale: mailLocale(body.locale), params: { code } });
  return { sent: true };
});
