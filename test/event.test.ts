import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allPaid, capacityImpact, changedFields, dayRemovalImpact, mineOf, nextStep, norm, paymentOf, rollCall, shareOf, vietqrUrl, votingOpen } from '../shared/utils/event.ts';
import { can, type Role } from '../shared/utils/roles.ts';
import { COVERS, coverOf } from '../shared/utils/cover.ts';
import { dayParts, fmtDateTime, monthGrid } from '../app/utils/format.ts';

const at = (min: number) => new Date(Date.UTC(2026, 9, 1, 0, min));
const going = (memberId: number, min: number, guests = 0) => ({ memberId, status: 'going', guests, goingAt: at(min) });
const ids = (rs: { memberId: number }[]) => rs.map((r) => r.memberId);

test('no capacity: everyone going is confirmed, in arrival order', () => {
  const r = rollCall([going(2, 5), going(1, 1, 2), { memberId: 3, status: 'maybe', guests: 0, goingAt: null }], null);
  assert.deepEqual(ids(r.confirmed), [1, 2]);
  assert.deepEqual(r.waitlist, []);
  assert.equal(r.seats, 4);
});

test('exact fit fills every seat', () => {
  const r = rollCall([going(1, 1, 1), going(2, 2)], 3);
  assert.deepEqual(ids(r.confirmed), [1, 2]);
  assert.equal(r.seats, 3);
});

test('strict first-come: a party that does not fit waits, and so does everyone after it', () => {
  const r = rollCall([going(1, 1), going(2, 2, 2), going(3, 3)], 3);
  assert.deepEqual(ids(r.confirmed), [1]);
  assert.deepEqual(ids(r.waitlist), [2, 3]);
  assert.equal(r.seats, 1);
});

test('a later goingAt (e.g. after adding guests) moves you behind others', () => {
  const r = rollCall([going(1, 9, 1), going(2, 2), going(3, 3)], 3);
  assert.deepEqual(ids(r.confirmed), [2, 3]);
  assert.deepEqual(ids(r.waitlist), [1]);
});

test('same goingAt: lower memberId first', () => {
  const r = rollCall([going(7, 1), going(4, 1)], 1);
  assert.deepEqual(ids(r.confirmed), [4]);
  assert.deepEqual(ids(r.waitlist), [7]);
});

test('share rounds up to 1,000 VND per seat', () => {
  assert.equal(shareOf(1_000_000, 3), 334_000);
  assert.equal(shareOf(1_000_000, 3)! * 3, 1_002_000); // a member with 2 guests
  assert.equal(shareOf(900_000, 3), 300_000);
  assert.equal(shareOf(1_000_000, 0), null);
  assert.equal(shareOf(null, 3), null);
});

test('norm ignores case, diacritics, đ and extra spaces', () => {
  assert.equal(norm('  Nguyễn  ĐỨC Thiên '), 'nguyen duc thien');
  assert.equal(norm('THIEN'), norm('Thiên'));
});

test('vietqrUrl folds the note to ASCII and caps it at 50 chars', () => {
  const url = new URL(vietqrUrl('VCB', '0123456789', 'NGUYEN DUC THIEN', 334_000, 'Sinh nhật tháng 10 🎂 Nguyễn Đức Thiên'));
  assert.equal(url.pathname, '/image/VCB-0123456789-compact2.png');
  assert.equal(url.searchParams.get('amount'), '334000');
  assert.equal(url.searchParams.get('addInfo'), 'sinh nhat thang 10 nguyen duc thien');
  assert.equal(vietqrUrl('VCB', '1', null, 1, 'x'.repeat(80)).match(/addInfo=(x+)/)![1].length, 50);
});

test('coverOf: URL → image, preset → its gradient, unset → stable pick by id', () => {
  assert.deepEqual(coverOf('https://x.test/a.jpg', 1), { image: 'https://x.test/a.jpg' });
  assert.deepEqual(coverOf('ocean', 1), { gradient: COVERS.ocean });
  assert.deepEqual(coverOf(null, 7), coverOf(null, 7));
  assert.notDeepEqual(coverOf(null, 0), coverOf(null, 1));
});

test('monthGrid: 42 days, Monday-first, covering the whole month', () => {
  const g = monthGrid(2026, 9); // October 2026 starts on a Thursday
  assert.equal(g.length, 42);
  assert.equal(g[0], '2026-09-28');
  assert.equal(g[3], '2026-10-01');
  assert.ok(g.includes('2026-10-31'));
  assert.equal(monthGrid(2026, 5)[0], '2026-06-01'); // June 2026 starts on a Monday
});

test('mineOf: votes, and only confirmed attendees owe share × (1 + guests)', () => {
  const row = { days: ['2026-10-23'], venueIds: [], status: 'going', guests: 2, paidAt: null };
  assert.deepEqual(mineOf(row, true, false, 100_000), { voted: true, status: 'going', waitlisted: false, owes: 300_000, paid: false, paidAmount: 0, left: 300_000 });
  assert.equal(mineOf(row, false, true, 100_000).owes, null);
  assert.deepEqual(mineOf(undefined, false, false, null), { voted: false, status: null, waitlisted: false, owes: null, paid: false, paidAmount: 0, left: 0 });
});

test('nextStep: one step per stage and answer, organizer moves only when due', () => {
  const m = (o: Partial<ReturnType<typeof mineOf>>) => ({ ...mineOf(undefined, false, false, null), ...o });
  const s = (stage: string, mine: ReturnType<typeof mineOf> | null, extra = {}) =>
    nextStep({ stage, mine, manager: false, allPaid: false, started: false, ...extra });
  assert.equal(s('poll', m({})).step, 'vote');
  assert.equal(s('poll', m({ voted: true })).step, 'voted');
  assert.equal(s('rsvp', m({})).step, 'rsvp');
  assert.equal(s('rsvp', m({}), { started: true }).step, 'done');
  assert.equal(s('rsvp', m({ status: 'going' })).step, 'going');
  assert.equal(s('rsvp', m({ status: 'going', waitlisted: true })).step, 'waitlist');
  assert.equal(s('rsvp', m({ status: 'no' })).step, 'replied');
  assert.equal(s('bill', m({ owes: 1000 })).step, 'pay');
  assert.equal(s('bill', m({ owes: 1000, paid: true })).step, 'paid');
  assert.equal(s('bill', m({})).step, 'done');
  assert.equal(s('settled', null).step, 'settled');
  assert.equal(s('poll', null).action, null);
  assert.equal(s('poll', null, { manager: true }).action, 'lock');
  assert.equal(s('rsvp', null, { manager: true }).action, null);
  assert.equal(s('rsvp', null, { manager: true, started: true }).action, 'bill');
  assert.equal(s('bill', null, { manager: true }).action, null);
  assert.equal(s('bill', null, { manager: true, allPaid: true }).action, 'settle');
});

test('vi weekday is deterministic (fixed table), en unchanged', () => {
  assert.equal(dayParts('2026-10-23', 'vi').weekday, 'T6');
  assert.equal(dayParts('2026-10-25', 'vi').weekday, 'CN');
  assert.match(fmtDateTime('2026-10-23T12:00:00Z', 'vi'), /^\d\d:\d\d T6|^T6/);
  assert.equal(dayParts('2026-10-23', 'en').weekday, 'Fri');
});

test('nextStep: cancelled overrides everything, a closed poll asks for the winner', () => {
  const mine = mineOf(undefined, false, false, null);
  const o = { stage: 'poll', mine, manager: true, allPaid: false, started: false };
  assert.deepEqual(nextStep({ ...o, cancelled: true }), { step: 'cancelled', action: null });
  assert.deepEqual(nextStep({ ...o, votingClosed: true }), { step: 'voteClosed', action: 'lock' });
  assert.equal(nextStep({ ...o, manager: false, votingClosed: true }).step, 'voteClosed');
});

test('nextStep: a partial payment still asks the member to pay', () => {
  const mine = mineOf({ days: [], venueIds: [], status: 'going', guests: 0, paidAt: new Date(), paidAmount: 40_000 }, true, false, 100_000);
  assert.equal(mine.left, 60_000);
  assert.equal(nextStep({ stage: 'bill', mine, manager: false, allPaid: false, started: true }).step, 'pay');
});

test('paymentOf: unpaid, partial, exact, overpaid and legacy rows', () => {
  assert.deepEqual(paymentOf(undefined, 100), { paid: 0, left: 100, done: false });
  assert.deepEqual(paymentOf({ paidAt: new Date(), paidAmount: 40 }, 100), { paid: 40, left: 60, done: false });
  assert.equal(paymentOf({ paidAt: new Date(), paidAmount: 100 }, 100).done, true);
  assert.deepEqual(paymentOf({ paidAt: new Date(), paidAmount: 150 }, 100), { paid: 150, left: 0, done: true });
  assert.deepEqual(paymentOf({ paidAt: new Date(), paidAmount: null }, 100), { paid: 100, left: 0, done: true });
  assert.equal(paymentOf({ paidAt: null, paidAmount: null }, 100).done, false);
});

test('allPaid: needs a share, someone confirmed, and everyone done', () => {
  const paid = { guests: 1, paidAt: new Date(), paidAmount: null };
  assert.equal(allPaid([paid], 100), true);
  assert.equal(allPaid([paid, { guests: 0, paidAt: null, paidAmount: 50 }], 100), false);
  assert.equal(allPaid([], 100), false);
  assert.equal(allPaid([paid], null), false);
});

test('votingOpen: only while polling, not cancelled, before the deadline', () => {
  const now = Date.UTC(2026, 9, 10);
  assert.equal(votingOpen({ stage: 'poll' }, now), true);
  assert.equal(votingOpen({ stage: 'rsvp' }, now), false);
  assert.equal(votingOpen({ stage: 'poll', cancelledAt: new Date() }, now), false);
  assert.equal(votingOpen({ stage: 'poll', voteDeadline: new Date(now + 1000) }, now), true);
  assert.equal(votingOpen({ stage: 'poll', voteDeadline: new Date(now - 1000) }, now), false);
});

test('can: host does everything, co-host cannot reopen/cancel/delete/manage the co-host link, others nothing', () => {
  const shared = ['edit', 'advance', 'removeVenue', 'setOthers'] as const;
  const hostOnly = ['reopen', 'cancel', 'delete', 'cohost'] as const;
  for (const a of [...shared, ...hostOnly]) assert.equal(can('host', a), true, `host ${a}`);
  for (const a of shared) assert.equal(can('cohost', a), true, `cohost ${a}`);
  for (const a of hostOnly) assert.equal(can('cohost', a), false, `cohost ${a}`);
  for (const a of [...shared, ...hostOnly]) assert.equal(can(null as Role, a), false, `participant ${a}`);
});

test('changedFields: an untouched form has no changes', () => {
  const snap = { title: 'Lunch', capacity: null, voteDeadline: '', pollDays: ['2026-10-02', '2026-10-01'] };
  assert.deepEqual(changedFields(snap, { ...snap, pollDays: ['2026-10-01', '2026-10-02'] }), {});
});

test('changedFields: only edited keys, trimmed; an untouched deadline is absent', () => {
  const snap = { title: 'Lunch', note: '', voteDeadline: '2026-10-05T19:00' };
  assert.deepEqual(changedFields(snap, { ...snap, title: '  Dinner ' }), { title: 'Dinner' });
});

test('changedFields: null and empty string are the same, whitespace-only counts as empty', () => {
  assert.deepEqual(changedFields({ venue: null }, { venue: '' }), {});
  assert.deepEqual(changedFields({ venue: '' }, { venue: '   ' }), {});
  assert.deepEqual(changedFields({ venue: 'Pho 24' }, { venue: '' }), { venue: null });
});

test('changedFields: capacity number vs null', () => {
  assert.deepEqual(changedFields({ capacity: null as number | null }, { capacity: 8 }), { capacity: 8 });
  assert.deepEqual(changedFields({ capacity: 8 as number | null }, { capacity: null }), { capacity: null });
  assert.deepEqual(changedFields({ capacity: 8 as number | null }, { capacity: 8 }), {});
});

test('changedFields: changed day list is reported whole', () => {
  assert.deepEqual(changedFields({ pollDays: ['2026-10-01'] }, { pollDays: ['2026-10-01', '2026-10-03'] }), { pollDays: ['2026-10-01', '2026-10-03'] });
});

test('dayRemovalImpact: lists the voters of each removed day, skips unvoted days', () => {
  const votes = [
    { name: 'An', days: ['2026-10-03', '2026-10-01'] },
    { name: 'Binh', days: ['2026-10-03'] },
    { name: 'Chi', days: ['2026-10-01'] },
  ];
  assert.deepEqual(dayRemovalImpact(['2026-10-01', '2026-10-02', '2026-10-03'], ['2026-10-01'], votes), [{ day: '2026-10-03', names: ['An', 'Binh'] }]);
  assert.deepEqual(dayRemovalImpact(['2026-10-01', '2026-10-03'], ['2026-10-01', '2026-10-03'], votes), []);
  assert.deepEqual(dayRemovalImpact(['2026-10-03', '2026-10-01'], [], votes).map((r) => r.day), ['2026-10-01', '2026-10-03']);
});

test('capacityImpact: lowering the limit waitlists the whole party that no longer fits, and everyone after it', () => {
  const rs = [going(1, 1), going(2, 2, 1), going(3, 3)];
  const r = capacityImpact(rs, 5, 2);
  assert.deepEqual(ids(r.waitlisted), [2, 3]);
  assert.deepEqual(r.promoted, []);
});

test('capacityImpact: no limit set or a limit that still fits changes nobody', () => {
  const rs = [going(1, 1), going(2, 2)];
  assert.deepEqual(capacityImpact(rs, null, 2), { waitlisted: [], promoted: [] });
  assert.deepEqual(capacityImpact(rs, 2, 10), { waitlisted: [], promoted: [] });
});

test('capacityImpact: raising the limit or removing it promotes the waitlist; people already waiting are not reported as moved', () => {
  const rs = [going(1, 1), going(2, 2), going(3, 3)];
  assert.deepEqual(ids(capacityImpact(rs, 1, 2).promoted), [2]);
  assert.deepEqual(ids(capacityImpact(rs, 1, null).promoted), [2, 3]);
  assert.deepEqual(capacityImpact(rs, 1, 1).waitlisted, []);
  assert.deepEqual(ids(capacityImpact(rs, 2, 1).waitlisted), [2]);
});
