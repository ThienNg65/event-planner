import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleCalendarUrl, icsOf } from '../shared/utils/ics.ts';

const origin = 'https://events.example.com';
const base = { id: 7, joinKey: 'abc123', title: 'Tiệc', startsAt: '2026-10-20T11:30:00.000Z' };
const now = new Date('2026-10-14T01:02:03.456Z');
const octets = (s: string) => new TextEncoder().encode(s).length;
const unfold = (s: string) => s.replace(/\r\n /g, '');

test('icsOf: UTC start, 2 h duration, stable UID, CRLF endings', () => {
  const ics = icsOf({ ...base, venue: 'Quán A' }, origin, now);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'no bare LF');
  for (const l of ['UID:event-7@events.example.com', 'DTSTAMP:20261014T010203Z', 'DTSTART:20261020T113000Z', 'DURATION:PT2H', 'SUMMARY:Tiệc', 'LOCATION:Quán A', 'URL:https://events.example.com/e/7?join=abc123']) {
    assert.ok(ics.split('\r\n').includes(l), l);
  }
  assert.ok(!ics.includes('STATUS:') && !ics.includes('DESCRIPTION:') && icsOf(base, origin, now).includes('LOCATION') === false);
});

test('icsOf: escapes backslash, semicolon, comma and newlines', () => {
  const ics = icsOf({ ...base, title: 'a,b;c\\d', note: 'line1\nline2\r\nline3' }, origin, now);
  assert.ok(ics.includes('SUMMARY:a\\,b\\;c\\\\d\r\n'));
  assert.ok(ics.includes('DESCRIPTION:line1\\nline2\\nline3\r\n'));
});

test('icsOf: folds at 75 octets without splitting a Vietnamese character, and unfolds back', () => {
  const title = 'Liên hoan tất niên cuối năm của đội Kỹ thuật ở quán nướng Đà Lạt - ' + 'ế'.repeat(60);
  const ics = icsOf({ ...base, title }, origin, now);
  for (const l of ics.split('\r\n')) assert.ok(octets(l) <= 75, `${octets(l)}: ${l}`);
  assert.ok(ics.split('\r\n').some((l) => l.startsWith(' ')), 'folded');
  assert.ok(unfold(ics).includes(`SUMMARY:${title}\r\n`));
  assert.ok(!ics.includes('�'));
});

test('icsOf: a cancelled event is marked STATUS:CANCELLED', () => {
  assert.ok(icsOf({ ...base, cancelledAt: new Date() }, origin, now).includes('STATUS:CANCELLED\r\n'));
});

test('googleCalendarUrl: UTC start/end 2 h apart, title, place and link', () => {
  const u = new URL(googleCalendarUrl({ ...base, note: 'Mang ví', venue: 'Quán A' }, origin));
  assert.equal(u.origin + u.pathname, 'https://calendar.google.com/calendar/render');
  assert.equal(u.searchParams.get('action'), 'TEMPLATE');
  assert.equal(u.searchParams.get('text'), 'Tiệc');
  assert.equal(u.searchParams.get('dates'), '20261020T113000Z/20261020T133000Z');
  assert.equal(u.searchParams.get('location'), 'Quán A');
  assert.equal(u.searchParams.get('details'), 'Mang ví\n\nhttps://events.example.com/e/7?join=abc123');
  assert.equal(new URL(googleCalendarUrl(base, origin)).searchParams.has('location'), false);
});
