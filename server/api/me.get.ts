import { eq, sql } from 'drizzle-orm';

/**
 * The signed-in member, or null. `organizer`: has created an event, so may archive leftover members. `hasPin`: a PIN is set.
 * `email`: their verified address (only ever shown to them), which kinds of mail they muted, and while a recent change's
 * cool-down runs, when it ends. `emailEnabled`: false until mail is configured, and the app then hides everything about it.
 */
export default defineEventHandler(async (event) => {
  const token = sessionToken(event);
  if (!token) return null;
  const { members, memberEmail } = schema;
  const [m] = await useDb()
    .select({
      id: members.id,
      name: members.name,
      organizer: organizes(members.id).mapWith(Boolean),
      hasPin: sql<boolean>`${members.pinHash} is not null`,
      address: memberEmail.email,
      muted: memberEmail.mutedKinds,
      cooldownUntil: sql<string | null>`case when ${memberEmail.recoveryAfter} > now() then ${memberEmail.recoveryAfter} end`,
    })
    .from(members)
    .leftJoin(memberEmail, eq(memberEmail.memberId, members.id))
    .where(tokenMatches(token));
  if (!m) return null;
  const { address, muted, cooldownUntil, ...rest } = m;
  return { ...rest, emailEnabled: emailEnabled(), email: address ? { address, muted: muted ?? [], cooldownUntil } : null };
});
