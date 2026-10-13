import { randomBytes } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';

/**
 * Exchanges a valid invite for an access key (returned once). The invite is burned in the same conditional UPDATE,
 * so of two simultaneous accepts only one wins. The signed-in member must be the invited one.
 */
export default defineEventHandler(async (event) => {
  const { cohosts } = schema;
  const ev = await findEvent(routeId(event));
  const row = await inviteRow(ev.id, await readJson(event));
  if (row.expired) fail(410, 'inviteExpired');
  if ((await meOf(event)) !== row.memberId) fail(403, 'notYou');
  if (ev.cancelledAt) fail(409, 'cancelled');

  const key = randomBytes(32).toString('base64url');
  const won = await useDb()
    .update(cohosts)
    .set({ status: 'active', keyHash: sha256(key), inviteHash: null, acceptedAt: new Date() })
    .where(
      and(
        eq(cohosts.eventId, ev.id),
        eq(cohosts.memberId, row.memberId),
        eq(cohosts.inviteHash, sha256(row.invite)),
        eq(cohosts.status, 'invited'),
        gt(cohosts.invitedAt, sql`now() - make_interval(secs => ${INVITE_TTL_MS / 1000})`)
      )
    )
    .returning({ memberId: cohosts.memberId });
  if (!won.length) fail(404, 'inviteInvalid');
  return { key };
});
