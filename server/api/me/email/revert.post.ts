import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';

/**
 * The "not me" link of an address-change mail, from the browser page it opens (the link itself changes nothing). Puts the
 * previous address back, signs the member out everywhere and kills their sign-in link, in one statement. The signed token
 * names the change by its end time, so it works once and only while the cool-down lasts. The PIN is not touched: the
 * owner now gets recovery codes again and can choose a new one.
 */
export default defineEventHandler(async (event) => {
  const { secret } = requireEmailEnabled();
  const [, memberId, untilMs] = verifyToken(secret, (await readJson(event)).token)?.match(/^revert:(\d+):(\d+)$/) ?? [];
  if (!memberId) fail(400, 'revertInvalid');
  const lockedOut = sha256(randomBytes(32).toString('base64url'));
  const { rows } = await useDb().execute(sql`
    with restored as (
      update member_email set email = prev_email, prev_email = null, prev_until = null, recovery_after = null
      where member_id = ${Number(memberId)}::int and prev_email is not null and prev_until > now()
        and (extract(epoch from prev_until) * 1000)::bigint = ${untilMs}::bigint
      returning member_id),
    gone as (delete from member_sessions where member_id in (select member_id from restored)),
    rotated as (update members set token_hash = ${lockedOut}::text where id in (select member_id from restored))
    select member_id from restored`);
  if (!rows.length) fail(400, 'revertInvalid');
  return { ok: true };
});
