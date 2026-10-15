export const REPEATS = ['weekly', 'biweekly', 'monthly'] as const;
export type Repeat = (typeof REPEATS)[number];

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const VN_OFFSET = 7 * HOUR;
/** A next event is created this long before it starts (but never before the previous one has started). */
export const CREATE_AHEAD_MS = 14 * DAY;

/** The Vietnam calendar day (YYYY-MM-DD) of an instant. */
export const vnDay = (at: Date) => new Date(at.getTime() + VN_OFFSET).toISOString().slice(0, 10);

/**
 * The start of the occurrence after `startsAt`, same Vietnam wall-clock time. Monthly keeps `anchorDay` (the day of the month of the
 * series' first event) and clamps to the month's last day, so 31 Jan → 28 Feb → 31 Mar.
 */
export function nextOccurrence(startsAt: Date, repeat: Repeat, anchorDay = new Date(startsAt.getTime() + VN_OFFSET).getUTCDate()) {
  if (repeat === 'weekly') return new Date(startsAt.getTime() + 7 * DAY);
  if (repeat === 'biweekly') return new Date(startsAt.getTime() + 14 * DAY);
  const vn = new Date(startsAt.getTime() + VN_OFFSET);
  const lastDay = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() + 2, 0)).getUTCDate();
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() + 1, Math.min(anchorDay, lastDay), vn.getUTCHours(), vn.getUTCMinutes(), vn.getUTCSeconds()) - VN_OFFSET);
}

/**
 * The event the series should get next, or null when it is not time yet or the series has ended. `latest` is the series' last event
 * (cancelled or not); `until` is a Vietnam date. Dates already in the past (the tick was down) are skipped, not created.
 */
export function nextInSeries(o: { latest: Date; repeat: Repeat; until: string | null; anchorDay: number; now: Date }) {
  let next = nextOccurrence(o.latest, o.repeat, o.anchorDay);
  while (next <= o.now) next = nextOccurrence(next, o.repeat, o.anchorDay);
  if (o.until && vnDay(next) > o.until) return null;
  return o.now.getTime() >= Math.max(o.latest.getTime(), next.getTime() - CREATE_AHEAD_MS) ? next : null;
}
