import { sql, type SQL } from 'drizzle-orm';

/** A typed Postgres array built from bound parameters (`'{}'` when empty). */
export function sqlArray(items: (string | number)[], type: 'date' | 'int'): SQL {
  if (!items.length) return sql.raw(`'{}'::${type}[]`);
  return sql`ARRAY[${sql.join(items.map((i) => sql`${i}::${sql.raw(type)}`), sql`, `)}]`;
}

/** The event's candidate days as stored right now, as a scalar subquery (a vote is filtered against this inside its own statement). The cast keeps `= ANY(...)` from reading it as a row set. */
export const currentDays = (eventId: number): SQL =>
  sql`(SELECT ${schema.events.pollDays} FROM ${schema.events} WHERE ${schema.events.id} = ${eventId})::date[]`;

/** The event's venue ids as stored right now. */
export const currentVenueIds = (eventId: number): SQL =>
  sql`(SELECT ${schema.venues.id} FROM ${schema.venues} WHERE ${schema.venues.eventId} = ${eventId})`;

/** A real calendar day written as YYYY-MM-DD. */
export const isDay = (d: unknown): d is string =>
  typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

/** Today as YYYY-MM-DD in team time (UTC+7). */
export const teamToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
