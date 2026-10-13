// ponytail: one fixed team timezone so SSR (UTC on Netlify) and browsers render the same text.
const TZ = 'Asia/Ho_Chi_Minh';

/** "2026-10-23" + "19:00" in team time (UTC+7, no DST) → ISO instant. */
export const teamTime = (day: string, time: string) => new Date(`${day}T${time}:00+07:00`).toISOString();

// Node ICU renders vi weekdays as "Th 6", Chrome as "Thứ 6": use a fixed table so SSR and browser match.
const VI_WEEKDAY: Record<string, string> = { Mon: 'T2', Tue: 'T3', Wed: 'T4', Thu: 'T5', Fri: 'T6', Sat: 'T7', Sun: 'CN' };

/** Like Intl.DateTimeFormat#format, but the vi weekday comes from VI_WEEKDAY; en is untouched. */
export const fmtParts = (date: Date, locale: string, opts: Intl.DateTimeFormatOptions) => {
  const parts = new Intl.DateTimeFormat(locale, opts).formatToParts(date);
  if (!locale.startsWith('vi') || !opts.weekday) return parts.map((p) => p.value).join('');
  const en = new Intl.DateTimeFormat('en', { timeZone: opts.timeZone, weekday: 'short' }).format(date);
  return parts.map((p) => (p.type === 'weekday' ? VI_WEEKDAY[en] : p.value)).join('');
};

export const fmtDateTime = (iso: string | Date, locale: string) =>
  fmtParts(new Date(iso), locale, {
    timeZone: TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** A poll day ("2026-10-23") is a calendar date, not an instant. */
export const fmtDay = (day: string, locale: string) =>
  fmtParts(new Date(`${day}T00:00:00Z`), locale, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

/** Big day number + short month for a calendar-style date block, in team time. */
export const dateBlock = (iso: string | Date, locale: string) => ({
  day: new Date(iso).toLocaleString(locale, { timeZone: TZ, day: 'numeric' }),
  month: new Date(iso).toLocaleString(locale, { timeZone: TZ, month: 'short' }),
});

/** Badge/chip color per event stage. */
export const STAGE_COLOR = { poll: 'warning', rsvp: 'primary', bill: 'success', settled: 'secondary' } as const;

export const fmtVnd =(n: number) => `${n.toLocaleString('vi-VN')} ₫`;

/** The 42 calendar days ("YYYY-MM-DD", Monday-first, 6 weeks) shown for a month view; month is 0-11. */
export function monthGrid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const start = first.getTime() - ((first.getUTCDay() + 6) % 7) * 86_400_000;
  return Array.from({ length: 42 }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
}

/** ISO instant → "2026-10-23T19:00" in team time, for a datetime-local input (inverse of teamTime). */
export const toTeamInput = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 16);

/** Weekday and "23 Oct" of a poll day, for a day tile. */
export const dayParts = (day: string, locale: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return {
    weekday: fmtParts(d, locale, { timeZone: 'UTC', weekday: 'short' }),
    date: d.toLocaleDateString(locale, { timeZone: 'UTC', day: 'numeric', month: 'short' }),
  };
};
