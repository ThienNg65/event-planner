/** Calendar entries have no end time in the data, so every one lasts this long. */
const DURATION_HOURS = 2;

export type IcsEvent = {
  id: number;
  joinKey: string;
  title: string;
  note?: string | null;
  startsAt: Date | string;
  venue?: string | null;
  cancelledAt?: unknown;
};

const encoder = new TextEncoder();

/** RFC 5545 TEXT escaping: backslash, semicolon, comma and line breaks. */
const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');

/** Folds a content line at 75 octets (UTF-8 bytes); a continuation starts with one space. Never splits a character. */
function fold(line: string) {
  const out: string[] = [];
  let cur = '';
  let used = 0;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    if (used + n > 75) {
      out.push(cur);
      cur = ' ';
      used = 1;
    }
    cur += ch;
    used += n;
  }
  out.push(cur);
  return out.join('\r\n');
}

/** `YYYYMMDDTHHMMSSZ` of an instant in UTC. */
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

const endOf = (start: Date) => new Date(start.getTime() + DURATION_HOURS * 3600_000);

/** The event page link, the same joining link the share dialog hands out (a private event opens only with it). */
const pageUrl = (ev: IcsEvent, origin: string) => `${origin}/e/${ev.id}?join=${ev.joinKey}`;

/** An iCalendar file (CRLF lines) with one VEVENT; the UID is stable, so re-importing updates the entry. */
export function icsOf(ev: IcsEvent, origin: string, now = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Team Events//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:event-${ev.id}@${new URL(origin).host}`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART:${utc(new Date(ev.startsAt))}`,
    `DURATION:PT${DURATION_HOURS}H`,
    `SUMMARY:${escapeText(ev.title)}`,
    ...(ev.venue ? [`LOCATION:${escapeText(ev.venue)}`] : []),
    `URL:${pageUrl(ev, origin)}`,
    ...(ev.note ? [`DESCRIPTION:${escapeText(ev.note)}`] : []),
    ...(ev.cancelledAt ? ['STATUS:CANCELLED'] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Google Calendar "add event" link for the same entry. */
export function googleCalendarUrl(ev: IcsEvent, origin: string) {
  const start = new Date(ev.startsAt);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${utc(start)}/${utc(endOf(start))}`,
    details: [ev.note, pageUrl(ev, origin)].filter(Boolean).join('\n\n'),
  });
  if (ev.venue) q.set('location', ev.venue);
  return `https://calendar.google.com/calendar/render?${q}`;
}
