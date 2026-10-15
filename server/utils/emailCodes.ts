import { and, eq, gt, lt, sql } from 'drizzle-orm';

type Purpose = (typeof schema.CODE_PURPOSES)[number];

/**
 * Stores a fresh code for the member and purpose, replacing the old one, unless a cap is hit: one code per CODE_GAP_SECS,
 * `perDay` a day, and (recovery) `globalPerDay` across all members. One statement, so parallel requests can't pass a cap
 * together. Returns whether the code was stored; only then may it be mailed.
 */
export async function storeCode(memberId: number, purpose: Purpose, target: string, code: string, perDay: number, globalPerDay?: number) {
  const hash = hashCode(requireEmailEnabled().secret, memberId, purpose, code);
  const ttl = EMAIL_CODE_TTL_MS / 1000;
  const { rows } = await useDb().execute(sql`
    insert into member_codes (member_id, purpose, target_email, code_hash, expires_at, fails, sent_at, sends_today, sends_day)
    select ${memberId}::int, ${purpose}::text, ${target}::text, ${hash}::text, now() + make_interval(secs => ${ttl}::int), 0, now(), 1, current_date
    where ${globalPerDay ?? null}::int is null
       or (select coalesce(sum(sends_today), 0) from member_codes where purpose = ${purpose}::text and sends_day = current_date) < ${globalPerDay ?? 0}::int
    on conflict (member_id, purpose) do update set
      target_email = excluded.target_email, code_hash = excluded.code_hash, expires_at = excluded.expires_at, fails = 0, sent_at = now(),
      sends_today = case when member_codes.sends_day = current_date then member_codes.sends_today + 1 else 1 end, sends_day = current_date
    where member_codes.sent_at < now() - make_interval(secs => ${CODE_GAP_SECS}::int)
      and (member_codes.sends_day <> current_date or member_codes.sends_today < ${perDay}::int)
    returning member_id`);
  return rows.length > 0;
}

/**
 * Checks a code and uses it up, answering `codeInvalid` for every failure (wrong, expired, burned, none). Like `verifyPin`
 * a guess is counted before it is compared, in one UPDATE, so parallel guesses can't beat the limit: the EMAIL_CODE_MAX_FAILS-th
 * wrong guess burns the code. The right code is then deleted by its hash, so only one of several parallel uses gets through.
 * Returns the address the code was sent to.
 */
export async function consumeCode(memberId: number, purpose: Purpose, given: unknown) {
  const { memberCodes } = schema;
  const db = useDb();
  const code = clean(given, 20);
  if (!isCodeFormat(code)) fail(400, 'codeInvalid');
  const mine = and(eq(memberCodes.memberId, memberId), eq(memberCodes.purpose, purpose));
  const [row] = await db
    .update(memberCodes)
    .set({ fails: sql`${memberCodes.fails} + 1` })
    .where(and(mine, gt(memberCodes.expiresAt, sql`now()`), lt(memberCodes.fails, EMAIL_CODE_MAX_FAILS)))
    .returning({ hash: memberCodes.codeHash, fails: memberCodes.fails });
  if (!row) fail(400, 'codeInvalid');
  if (!sameHash(row.hash, hashCode(requireEmailEnabled().secret, memberId, purpose, code))) {
    if (row.fails >= EMAIL_CODE_MAX_FAILS) await db.delete(memberCodes).where(and(mine, eq(memberCodes.codeHash, row.hash)));
    fail(400, 'codeInvalid');
  }
  const [used] = await db
    .delete(memberCodes)
    .where(and(mine, eq(memberCodes.codeHash, row.hash), gt(memberCodes.expiresAt, sql`now()`)))
    .returning({ target: memberCodes.targetEmail });
  if (!used) fail(400, 'codeInvalid');
  return used.target;
}
