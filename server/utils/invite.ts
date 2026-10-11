import { and, eq } from 'drizzle-orm';

/** The pending invite row matching the secret `b.invite` for this event, or a 404 (a used, revoked or unknown invite looks the same). */
export async function inviteRow(eventId: number, body: Record<string, unknown>) {
  const { cohosts, members } = schema;
  const invite = clean(body.invite, 200);
  const [row] = invite
    ? await useDb()
        .select({ memberId: cohosts.memberId, name: members.name, invitedAt: cohosts.invitedAt })
        .from(cohosts)
        .innerJoin(members, eq(members.id, cohosts.memberId))
        .where(and(eq(cohosts.eventId, eventId), eq(cohosts.inviteHash, sha256(invite)), eq(cohosts.status, 'invited')))
    : [];
  if (!row) fail(404, 'inviteInvalid');
  return { ...row, invite, expired: Date.now() - row.invitedAt.getTime() > INVITE_TTL_MS };
}
