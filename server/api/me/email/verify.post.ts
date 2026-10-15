import { eq } from 'drizzle-orm';

/**
 * Confirms the code mailed by `POST /api/me/email` and saves the address with the member's consent. Replacing an earlier
 * address starts the cool-down: its owner is told, with a "not me" link, and recovery codes keep going there for 72 hours.
 */
export default defineEventHandler(async (event) => {
  const { secret, appUrl } = requireEmailEnabled();
  const me = await meOf(event);
  if (me === null) fail(401, 'signInFirst');
  const body = await readJson(event);
  const locale = mailLocale(body.locale);
  const email = await consumeCode(me, 'verify', body.code);
  const { memberEmail } = schema;
  const db = useDb();
  const [old] = await db.select().from(memberEmail).where(eq(memberEmail.memberId, me));
  const prev = previousAddress(old, email);
  const until = new Date(Date.now() + EMAIL_CHANGE_COOLDOWN_MS);
  const now = new Date();
  const row = {
    email,
    verifiedAt: now,
    consentAt: now,
    consentVersion: EMAIL_CONSENT_VERSION,
    locale,
    ...(prev ? { prevEmail: prev, prevUntil: until, recoveryAfter: until } : {}),
  };
  await db
    .insert(memberEmail)
    .values({ memberId: me, ...row })
    .onConflictDoUpdate({ target: memberEmail.memberId, set: row });
  if (prev) {
    const link = `${appUrl}/email/revert#t=${signToken(secret, `revert:${me}:${until.getTime()}`)}`;
    await trySendMail({ kind: 'notice', to: prev, template: 'emailChanged', locale: old?.locale ?? locale, params: { email, link } });
  }
  return { ok: true };
});
