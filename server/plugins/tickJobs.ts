import { sql } from 'drizzle-orm';

/** Notifications one tick sends: each may mail up to `SENDS_PER_RUN` people, and a Worker allows 50 requests per invocation. */
const SWEEP_PER_TICK = 2;

/** Queues "event tomorrow" for every locked, not cancelled event that starts tomorrow (Vietnam day). The fact is the start time, so a moved event is announced again. */
async function queueTomorrow(now: Date) {
  const { start, end } = tomorrowWindowVN(now);
  await useDb().execute(sql`
    insert into notifications (kind, event_id, fact)
    select 'tomorrow', id, floor(extract(epoch from starts_at) * 1000)::bigint::text
    from events
    where stage in ('rsvp', 'bill') and cancelled_at is null and starts_at >= ${start}::timestamptz and starts_at < ${end}::timestamptz
    on conflict do nothing`);
}

type BillAsked = { id: number; total: number; requestedAt: string; sent: number };

/**
 * Queues payment reminder 1 (day 2) or 2 (day 5) for events in the bill stage, counted from the first payment request for the
 * current total. Who still owes is worked out when the reminder is sent, so a fully paid event mails no one.
 */
async function queuePaymentReminders(now: Date) {
  const db = useDb();
  const { rows } = await db.execute<BillAsked>(sql`
    select e.id, e.bill_total as total, min(n.created_at) as "requestedAt",
      (select count(*) from notifications m where m.event_id = e.id and m.kind = 'paymentReminder' and m.fact like e.bill_total::text || '#%')::int as sent
    from events e
    join notifications n on n.event_id = e.id and n.kind = 'paymentRequested' and n.fact like '%→' || e.bill_total::text
    where e.stage = 'bill' and e.cancelled_at is null and e.bill_total is not null
    group by e.id`);
  for (const r of rows) {
    const due = reminderDue(new Date(r.requestedAt), now, r.sent);
    if (due)
      await db.execute(
        sql`insert into notifications (kind, event_id, fact) values ('paymentReminder', ${r.id}::int, ${reminderFact(r.total, due)}::text) on conflict do nothing`
      );
  }
}

// The hourly jobs (docs/13). The mail jobs do nothing while email is off, `repeat` does not need email; scheduled mails are only queued in daytime (`isSendingHour`).
export default defineNitroPlugin(() => {
  registerTickJob('tomorrow', async (now) => {
    if (emailEnabled() && isSendingHour(now)) await queueTomorrow(now);
  });
  registerTickJob('paymentReminders', async (now) => {
    if (emailEnabled() && isSendingHour(now)) await queuePaymentReminders(now);
  });
  registerTickJob('repeat', createDueOccurrences);
  registerTickJob('sweep', async () => {
    if (emailEnabled()) await dispatch(undefined, SWEEP_PER_TICK);
  });
});
