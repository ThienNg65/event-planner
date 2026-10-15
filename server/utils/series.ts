import { sql } from 'drizzle-orm';

/** A repeating event needs a fixed date, no date poll and a place (a place poll would have to be rerun every time). */
export function requireRepeatable(e: { repeat?: string | null; startsAt?: Date | null; pollDays?: string[]; venue?: string | null }) {
  if (e.repeat && (!e.startsAt || e.pollDays?.length || !e.venue)) fail(400, 'repeatNeedsFixedPlan');
}

type Latest = { id: number; seriesId: number; startsAt: string; repeat: Repeat; repeatUntil: string | null; firstAt: string };

/** At most this many events are created per tick (the Worker request budget). */
const NEW_PER_TICK = 10;

/**
 * Creates the next event of every repeating series that is due (docs/04). It copies the latest event of the series, even a cancelled one
 * (cancelling skips a single date), starts it in the RSVP stage, and makes the creator and the active co-hosts organizers of it.
 * One statement per event, guarded by the unique (series_id, starts_at), so overlapping ticks cannot create it twice.
 */
export async function createDueOccurrences(now: Date) {
  const db = useDb();
  const { rows } = await db.execute<Latest>(sql`
    select * from (
      select distinct on (e.series_id) e.id, e.series_id as "seriesId", e.starts_at as "startsAt", e.repeat, e.repeat_until as "repeatUntil",
        (select min(f.starts_at) from events f where f.series_id = e.series_id) as "firstAt"
      from events e
      where e.series_id is not null and e.starts_at is not null
      order by e.series_id, e.starts_at desc
    ) latest
    where latest.repeat is not null`);
  let created = 0;
  for (const r of rows) {
    if (created >= NEW_PER_TICK) break;
    const next = nextInSeries({
      latest: new Date(r.startsAt),
      repeat: r.repeat,
      until: r.repeatUntil,
      anchorDay: new Date(new Date(r.firstAt).getTime() + 7 * 3600_000).getUTCDate(),
      now,
    });
    if (!next) continue;
    const { rows: made } = await db.execute<{ id: number }>(sql`
      with made as (
        insert into events (title, note, stage, starts_at, venue, venue_link, capacity, max_guests, hide_votes, bank_id, bank_account, bank_holder,
          cover, honorees, theme, created_by, manage_key_hash, repeat, repeat_until, series_id)
        select title, note, case when venue is null then 'poll' else 'rsvp' end, ${next.toISOString()}::timestamptz, venue, venue_link, capacity, max_guests,
          hide_votes, bank_id, bank_account, bank_holder, cover, honorees, theme, created_by,
          replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), repeat, repeat_until, series_id
        from events where id = ${r.id}
        on conflict (series_id, starts_at) do nothing
        returning id, created_by
      ), host as (
        insert into responses (event_id, member_id) select id, created_by from made
      ), co as (
        insert into cohosts (event_id, member_id, status, key_hash, accepted_at)
        select made.id, c.member_id, 'active', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), now()
        from made join cohosts c on c.event_id = ${r.id} and c.status = 'active'
      )
      select id from made`);
    if (made.length) created++;
  }
  return created;
}
