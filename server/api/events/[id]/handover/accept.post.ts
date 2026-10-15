import { randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';

/**
 * The offered co-host takes the event over. One batch: the event UPDATE is guarded on the creator and the offer the
 * caller saw (plus the target still being an active co-host with a PIN), and the co-host swaps follow only when that UPDATE
 * took effect, so a stale accept (offer withdrawn or replaced, co-host removed, creator changed) changes nothing.
 * The new manage key is returned once, only to the new host.
 */
export default defineEventHandler(async (event) => {
  const { events, cohosts, members } = schema;
  const ev = await findEvent(routeId(event));
  const me = await meOf(event);
  if (me === null) fail(401, 'signInFirst');
  if (ev.handoverTo !== me) fail(409, 'handoverGone');
  requireCan(await roleOf(event, ev), 'acceptHandover');
  if (ev.cancelledAt) fail(409, 'cancelled');

  const key = randomBytes(32).toString('base64url');
  const hash = sha256(key);
  const db = useDb();
  // Statements after the first see its effect, so they run only if this exact request won.
  const won = sql`exists (select 1 from ${events} where ${events.id} = ${ev.id} and ${events.createdBy} = ${me} and ${events.manageKeyHash} = ${hash})`;
  const [done] = await db.batch([
    db
      .update(events)
      .set({ createdBy: me, manageKeyHash: hash, handoverTo: null, handoverAt: null })
      .where(
        and(
          eq(events.id, ev.id),
          eq(events.createdBy, ev.createdBy),
          eq(events.handoverTo, me),
          sql`${events.cancelledAt} is null`,
          sql`exists (select 1 from ${cohosts} where ${cohosts.eventId} = ${events.id} and ${cohosts.memberId} = ${me} and ${cohosts.status} = 'active')`,
          sql`exists (select 1 from ${members} where ${members.id} = ${me} and ${members.pinHash} is not null)`
        )
      )
      .returning({ id: events.id }),
    db.delete(cohosts).where(and(eq(cohosts.eventId, ev.id), eq(cohosts.memberId, me), won)),
    // A co-host needs a key hash (cohosts_key); nobody holds this one, the old host gets in through their member row.
    db
      .insert(cohosts)
      .select(
        db
          .select({
            eventId: sql<number>`${ev.id}::int`.as('event_id'),
            memberId: sql<number>`${ev.createdBy}::int`.as('member_id'),
            status: sql<'active'>`'active'`.as('status'),
            inviteHash: sql<string | null>`null::text`.as('invite_hash'),
            keyHash: sql<string>`${sha256(randomBytes(32).toString('hex'))}::text`.as('key_hash'),
            invitedAt: sql<Date>`now()`.as('invited_at'),
            acceptedAt: sql<Date>`now()`.as('accepted_at'),
          })
          .from(sql`(select 1) as one`)
          .where(won)
      )
      .onConflictDoNothing(),
  ]);
  if (!done.length) fail(409, 'handoverGone');
  return { key };
});
