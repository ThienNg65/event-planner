import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextInSeries, nextOccurrence, vnDay } from '../shared/utils/repeat.ts';

// 19:00 Vietnam time = 12:00 UTC.
const at = (d: string) => new Date(`${d}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 16);

test('weekly and every two weeks keep the wall-clock time', () => {
  assert.equal(iso(nextOccurrence(at('2026-10-22'), 'weekly')), '2026-10-29T12:00');
  assert.equal(iso(nextOccurrence(at('2026-10-22'), 'biweekly')), '2026-11-05T12:00');
});

test('monthly clamps to the last day but keeps the first event\'s day of month', () => {
  const feb = nextOccurrence(at('2027-01-31'), 'monthly', 31);
  assert.equal(iso(feb), '2027-02-28T12:00');
  assert.equal(iso(nextOccurrence(feb, 'monthly', 31)), '2027-03-31T12:00');
  assert.equal(iso(nextOccurrence(at('2028-01-31'), 'monthly', 31)), '2028-02-29T12:00');
  assert.equal(iso(nextOccurrence(at('2026-12-15'), 'monthly')), '2027-01-15T12:00');
});

test('the month is the Vietnam month: 01:00 on the 1st in Vietnam is still the 31st in UTC', () => {
  const first = new Date('2026-12-31T18:00:00Z'); // 01:00 on 1 Jan in Vietnam
  assert.equal(vnDay(first), '2027-01-01');
  assert.equal(nextOccurrence(first, 'monthly').toISOString(), '2027-01-31T18:00:00.000Z');
});

test('the next event appears once the previous one has started, and never earlier than 14 days before the next', () => {
  const o = { latest: at('2026-10-22'), repeat: 'weekly' as const, until: null, anchorDay: 22 };
  assert.equal(nextInSeries({ ...o, now: at('2026-10-21') }), null);
  assert.equal(iso(nextInSeries({ ...o, now: at('2026-10-22') })!), '2026-10-29T12:00');
  const monthly = { latest: at('2026-10-22'), repeat: 'monthly' as const, until: null, anchorDay: 22 };
  assert.equal(nextInSeries({ ...monthly, now: at('2026-11-01') }), null);
  assert.equal(iso(nextInSeries({ ...monthly, now: at('2026-11-08') })!), '2026-11-22T12:00');
});

test('the series stops after the until date (inclusive) and skips dates already past', () => {
  const o = { latest: at('2026-10-22'), repeat: 'weekly' as const, anchorDay: 22 };
  assert.equal(iso(nextInSeries({ ...o, until: '2026-10-29', now: at('2026-10-23') })!), '2026-10-29T12:00');
  assert.equal(nextInSeries({ ...o, until: '2026-10-28', now: at('2026-10-23') }), null);
  assert.equal(iso(nextInSeries({ ...o, until: null, now: at('2026-11-10') })!), '2026-11-12T12:00');
});
