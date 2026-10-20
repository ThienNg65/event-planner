import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allPaid, attendanceCheck, overLimit, capacityImpact, guestLimit, hasPicked, hasVoted, planFit, hidesVotes, redactVotes, deriveAttendance, heldOk, lockImpact, matchesPlan, planFor, planFrozen, seated, teamDay, pendingVoters, reminderOf, changedFields, dayRemovalImpact, mineOf, nextStep, norm, paymentOf, owesOf, rollCall, shareOf, splitOf, stageKey, compareDays, placeName, vietqrUrl, votingOpen } from '../shared/utils/event.ts';
import { can, type Role } from '../shared/utils/roles.ts';
import { pinProblem } from '../shared/utils/pin.ts';
import { COVERS, COVER_STOPS, coverOf, coverStops, coverTag } from '../shared/utils/cover.ts';
import { cardSvg } from '../shared/utils/card.ts';
import { DEFAULT_THEME, THEMES, themeOf } from '../shared/utils/theme.ts';
import { dateBlock, dayParts, fmtDateTime, initials, mapEmbedUrl, monthGrid, splitMentions } from '../app/utils/format.ts';

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

test('a sponsor pays a fixed amount, the rest splits over the other seats', () => {
  const rows = [{ guests: 0, sponsorAmount: 500_000 }, { guests: 0 }, { guests: 1 }, { guests: 0 }, { guests: 0 }];
  const share = splitOf(3_000_000, rows)!;
  assert.equal(share, 500_000); // 2.5M over 5 plain seats
  assert.equal(owesOf(rows[0]!, share), 500_000);
  assert.equal(owesOf(rows[2]!, share), 1_000_000);
  assert.equal(owesOf({ guests: 1, sponsorAmount: 500_000 }, share), 1_000_000, 'a sponsor’s guest still pays a share');
});

test('splitOf: no sponsors matches shareOf; sponsors covering the bill leave a zero share; nothing without a bill or seats', () => {
  assert.equal(splitOf(1_000_000, [{ guests: 0 }, { guests: 2 }]), shareOf(1_000_000, 4));
  assert.equal(splitOf(500_000, [{ guests: 0, sponsorAmount: 500_000 }, { guests: 0 }]), 0);
  assert.equal(splitOf(500_000, [{ guests: 0, sponsorAmount: 500_000 }]), 0);
  assert.equal(splitOf(null, [{ guests: 0 }]), null);
  assert.equal(splitOf(1000, []), null);
});

const checkRow = (memberId: number, status: string | null, guests = 0, paidAt: Date | null = null) => ({ memberId, status, guests, paidAt });

test('attendanceCheck: walk-ins go, seat holders who were unticked are no-shows, waitlisted ones are just dropped', () => {
  // A and B confirmed, C maybe, D waitlisted; C came with a friend, B and D did not come.
  const rows = [checkRow(1, 'going'), checkRow(2, 'going'), checkRow(3, 'maybe'), checkRow(4, 'going')];
  const r = attendanceCheck(rows, [1, 2], [{ memberId: 1, guests: 0 }, { memberId: 3, guests: 1 }], 2);
  assert.deepEqual(r.going, [{ memberId: 1, guests: 0 }, { memberId: 3, guests: 1 }]);
  assert.deepEqual(r.noShow, [2]);
  assert.deepEqual(r.dropped, [4]);
  assert.equal(r.seats, 3);
  assert.equal(r.capacity, 3, 'a party bigger than the limit raises it');
});

test('attendanceCheck: the limit only grows, unlimited stays unlimited, paid rows are left alone but count', () => {
  const rows = [checkRow(1, 'going'), checkRow(2, 'going', 1, at(0))];
  assert.equal(attendanceCheck(rows, [1, 2], [{ memberId: 1, guests: 0 }], 10).capacity, 10);
  assert.equal(attendanceCheck(rows, [1, 2], [{ memberId: 1, guests: 0 }], null).capacity, null);
  // Paid member 2 is unticked here, yet stays going: not a no-show, and their 2 seats still count.
  const r = attendanceCheck(rows, [1, 2], [{ memberId: 1, guests: 0 }], null);
  assert.deepEqual([r.noShow, r.dropped, r.seats], [[], [], 3]);
  assert.deepEqual(attendanceCheck(rows, [1, 2], [{ memberId: 2, guests: 5 }], null).going, [], 'a paid row is never rewritten');
});

test('overLimit: seats beyond the planned limit, 0 when it was never raised', () => {
  assert.equal(overLimit({ capacity: 15, plannedCapacity: 10 }), 5);
  assert.equal(overLimit({ capacity: 10, plannedCapacity: null }), 0);
  assert.equal(overLimit({ capacity: 8, plannedCapacity: 10 }), 0, 'lowered again in Edit');
  assert.equal(overLimit({ capacity: null, plannedCapacity: 10 }), 0);
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
  assert.deepEqual(mineOf(row, true, false, 100_000), { voted: true, status: 'going', derived: null, held: false, waitlisted: false, owes: 300_000, paid: false, paidAmount: 0, left: 300_000 });
  assert.equal(mineOf(row, false, true, 100_000).owes, null);
  assert.deepEqual(mineOf(undefined, false, false, null), { voted: false, status: null, derived: null, held: false, waitlisted: false, owes: null, paid: false, paidAmount: 0, left: 0 });
});

test('nextStep: one step per stage and answer, organizer moves only when due', () => {
  const m = (o: Partial<ReturnType<typeof mineOf>>) => ({ ...mineOf(undefined, false, false, null), ...o });
  const s = (stage: string, mine: ReturnType<typeof mineOf> | null, extra = {}) =>
    nextStep({ stage, mine, manager: false, allPaid: false, started: false, ...extra });
  assert.equal(s('poll', m({})).step, 'vote');
  assert.equal(s('poll', m({ voted: true })).step, 'voted');
  assert.equal(s('poll', m({ status: 'no' })).step, 'declined');
  assert.equal(s('poll', m({ status: 'no' }), { votingClosed: true }).step, 'voteClosed');
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
  assert.equal(dayParts('2026-10-23', 'vi').weekday, 'Thứ 6');
  assert.equal(dayParts('2026-10-25', 'vi').weekday, 'CN');
  assert.match(fmtDateTime('2026-10-23T12:00:00Z', 'vi'), /^\d\d:\d\d Thứ 6|^Thứ 6/);
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
  const shared = ['edit', 'advance', 'removeVenue', 'setOthers', 'remind', 'acceptHandover'] as const;
  const hostOnly = ['reopen', 'cancel', 'delete', 'cohost', 'rotateKey', 'handover'] as const;
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

test('pendingVoters: members with no day and no place picked, in roster order', () => {
  const roster = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const rs = [
    { memberId: 1, days: ['2026-10-01'], venueIds: [] },
    { memberId: 2, days: [], venueIds: [] },
    { memberId: 3, days: [], venueIds: [7] },
  ];
  assert.deepEqual(pendingVoters(roster, rs), [{ id: 2 }, { id: 4 }]);
  assert.deepEqual(pendingVoters(roster, [...rs, { memberId: 4, days: [], venueIds: [], status: 'no' }]), [{ id: 2 }]);
  assert.deepEqual(pendingVoters(roster, []), roster);
  assert.deepEqual(pendingVoters([], rs), []);
});


const plan = (day: string | null, venueIds: number[] = [], venuePolled = venueIds.length > 0) => ({ day, venuePolled, venueIds });
const vote = (days: string[], venueIds: number[] = []) => ({ days, venueIds });

test('matchesPlan: the locked day must be among the votes', () => {
  assert.equal(matchesPlan(vote(['2026-10-23']), plan('2026-10-23')), true);
  assert.equal(matchesPlan(vote(['2026-10-24']), plan('2026-10-23')), false);
});

test('matchesPlan: with places polled, upvoted places must include the locked one; no place upvotes = the day alone', () => {
  assert.equal(matchesPlan(vote(['2026-10-23'], [2]), plan('2026-10-23', [1])), false);
  assert.equal(matchesPlan(vote(['2026-10-23'], [1, 2]), plan('2026-10-23', [1])), true);
  assert.equal(matchesPlan(vote(['2026-10-23']), plan('2026-10-23', [1])), true);
});

test('matchesPlan: a places-only voter never matches a day poll; a place-only poll needs the chosen place', () => {
  assert.equal(matchesPlan(vote([], [1]), plan('2026-10-23', [1])), false);
  assert.equal(matchesPlan(vote([], [1]), plan(null, [1])), true);
  assert.equal(matchesPlan(vote([], [2]), plan(null, [1])), false);
  assert.equal(matchesPlan(vote([], [1]), planFor([], new Date(), [{ id: 1, name: 'A' }], 'typed elsewhere')), false);
});

test('teamDay: an instant late in the UTC day is already tomorrow in Vietnam', () => {
  assert.equal(teamDay('2026-10-23T17:30:00Z'), '2026-10-24');
});

test('heldOk and seated: a held seat counts only before its deadline', () => {
  const now = Date.UTC(2026, 9, 1, 12);
  const rows = [{ status: 'going', derived: 'reconfirm' }, { status: 'going', derived: null }, { status: 'no', derived: null }];
  assert.equal(heldOk({ reconfirmBy: new Date(now + 1) }, now), true);
  assert.equal(heldOk({ reconfirmBy: new Date(now - 1) }, now), false);
  assert.equal(heldOk({ reconfirmBy: null }, now), false);
  assert.equal(seated(rows, { reconfirmBy: new Date(now + 1) }, now).length, 2);
  assert.equal(seated(rows, { reconfirmBy: new Date(now - 1) }, now).length, 1);
  assert.equal(seated(rows, {}, now).length, 1);
});

test('planFrozen: fixed once the event has started or the bill is entered', () => {
  const now = Date.UTC(2026, 9, 1, 12);
  const f = (stage: string, startsAt: number) => planFrozen({ stage, startsAt: new Date(startsAt) }, now);
  assert.deepEqual([f('rsvp', now + 1), f('rsvp', now), f('bill', now + 1), f('settled', now + 1), f('poll', now - 1)], [false, true, true, true, false]);
});

const row = (memberId: number, o: Record<string, unknown> = {}) => ({
  memberId, status: null as string | null, guests: 0, goingAt: null as Date | null, days: ['2026-10-23'], venueIds: [] as number[],
  derived: null as string | null, paidAt: null as unknown, firstVotedAt: at(memberId) as Date | null, ...o,
});
const NO_HOLDS = {};

test('deriveAttendance lock: unanswered fitting voters go, others are untouched', () => {
  const rows = [row(1), row(2, { days: ['2026-10-24'] }), row(3, { status: 'maybe' })];
  const d = deriveAttendance(rows, plan('2026-10-23'), 'lock', NO_HOLDS);
  assert.deepEqual([ids(d.going), ids(d.untouched), d.hold.length], [[1], [2, 3], 0]);
});

test('deriveAttendance edit: only derived rows are re-checked; edits never auto-mark anyone else', () => {
  const now = Date.now();
  const ev = { reconfirmBy: new Date(now + 3600_000) };
  const rows = [
    row(1, { status: 'maybe' }),
    row(2, { status: 'going', derived: 'going', paidAt: new Date() }),
    row(3, { status: 'going', derived: 'going', days: ['2026-10-24'] }),
    row(4, { status: 'going', derived: 'reconfirm' }),
    row(5),
  ];
  const d = deriveAttendance(rows, plan('2026-10-23'), 'edit', ev, now);
  assert.deepEqual([ids(d.untouched), ids(d.hold), ids(d.going), ids(d.release)], [[1, 2, 5], [3], [4], []]);
});

test('deriveAttendance edit: an expired hold is released even if it matches the new plan (no revival)', () => {
  const now = Date.now();
  const d = deriveAttendance([row(1, { status: 'going', derived: 'reconfirm' })], plan('2026-10-23'), 'edit', { reconfirmBy: new Date(now - 1) }, now);
  assert.deepEqual([ids(d.release), d.going.length], [[1], 0]);
});

test('lockImpact: capacity and first-vote order decide who goes and who waits', () => {
  const rows = [row(1, { firstVotedAt: at(3) }), row(2, { firstVotedAt: at(1) }), row(3, { firstVotedAt: at(2) })];
  const r = lockImpact(rows, plan('2026-10-23'), 2, at(99), NO_HOLDS, 'lock');
  assert.deepEqual([ids(r.going), ids(r.waiting)], [[2, 3], [1]]);
});

test('lockImpact: equal first votes tie-break on member id; a vote without a timestamp uses the lock time', () => {
  const rows = [row(7, { firstVotedAt: at(1) }), row(4, { firstVotedAt: at(1) }), row(9, { firstVotedAt: null })];
  const r = lockImpact(rows, plan('2026-10-23'), 2, at(99), NO_HOLDS, 'lock');
  assert.deepEqual([ids(r.going), ids(r.waiting)], [[4, 7], [9]]);
});

test('lockImpact edit: held members keep their priority, seated or waitlisted', () => {
  const now = Date.now();
  const ev = { reconfirmBy: new Date(now + 3600_000) };
  const d = (m: number, min: number) => row(m, { status: 'going', derived: 'going', goingAt: at(min), days: ['2026-10-30'] });
  const rows = [d(1, 1), d(2, 2), row(3, { status: 'going', derived: null, goingAt: at(3) })];
  const r = lockImpact(rows, plan('2026-10-23'), 1, at(99), ev, 'edit', now);
  assert.deepEqual(ids(r.hold), [1, 2]);
  assert.deepEqual([ids(r.going), ids(r.waiting)], [[1], [2]]);
});

test('nextStep: held, expired and unmatched voters are asked to confirm', () => {
  const m = (o: Partial<ReturnType<typeof mineOf>>) => ({ ...mineOf(undefined, false, false, null), ...o });
  const s = (mine: ReturnType<typeof mineOf>, started = false) => nextStep({ stage: 'rsvp', mine, manager: false, allPaid: false, started }).step;
  assert.equal(s(m({ status: 'going', derived: 'reconfirm', held: true })), 'confirm');
  assert.equal(s(m({ status: 'going', derived: 'reconfirm' })), 'confirm');
  assert.equal(s(m({ voted: true })), 'confirm');
  assert.equal(s(m({})), 'rsvp');
  assert.equal(s(m({ voted: true }), true), 'done');
});

test('nextStep: a debt is still payable after Completed', () => {
  const m = (o: Partial<ReturnType<typeof mineOf>>) => ({ ...mineOf(undefined, false, false, null), ...o });
  const s = (mine: ReturnType<typeof mineOf>) => nextStep({ stage: 'settled', mine, manager: false, allPaid: false, started: true }).step;
  assert.equal(s(m({ owes: 1000 })), 'pay');
  assert.equal(s(m({ owes: 1000, paid: true })), 'settled');
});

test('themeOf: known keys pass through, anything else falls back to the default theme', () => {
  for (const k of THEMES) assert.equal(themeOf(k), k);
  assert.equal(themeOf('nope'), DEFAULT_THEME);
  assert.equal(themeOf(null), DEFAULT_THEME);
  assert.equal(DEFAULT_THEME, 'aurora');
});

test('coverStops and coverTag: presets map to hex stops, unset is a stable pick, the tag follows the cover', () => {
  assert.deepEqual(coverStops('ocean', 1), COVER_STOPS.ocean);
  assert.deepEqual(coverStops('https://x.test/a.jpg', 7), coverStops(null, 7));
  assert.notEqual(coverTag('ocean'), coverTag('sunset'));
  assert.equal(coverTag(null), coverTag(null));
});

test('cardSvg: carries the QR path and the background it was given', () => {
  const grad = cardSvg('https://x.test/e/1', { stops: COVER_STOPS.aurora });
  assert.match(grad, /<path d="M\d+ \d+h/);
  assert.match(grad, /linearGradient/);
  const pic = cardSvg('https://x.test/e/1', { image: 'data:image/png;base64,AAAA' });
  assert.match(pic, /<image href="data:image\/png;base64,AAAA"/);
  assert.doesNotMatch(pic, /linearGradient/);
});

test('initials: two letters, first and last word or the start of a one-word name', () => {
  assert.equal(initials('Thiên'), 'TH');
  assert.equal(initials('Lê Văn Đông'), 'LĐ');
  assert.equal(initials('  tú  '), 'TÚ');
  assert.equal(initials(''), '');
});

test('initials: emoji and symbols in a name are not initials', () => {
  assert.equal(initials('Hà Anh Tuấn 🕴️'), 'HT');
  assert.equal(initials('Thiên 🎂'), 'TH');
  assert.equal(initials('🎂'), '');
});

test('initials: a decomposed accent stays with its letter', () => {
  assert.equal(initials('Ánh'), 'ÁN');
});

test('splitMentions: @name plus capitalized words, not emails', () => {
  assert.deepEqual(splitMentions('Mừng @Dong Le, @Thien dep trai'), ['Mừng ', '@Dong Le', ', ', '@Thien', ' dep trai']);
  assert.deepEqual(splitMentions('mail a@b.com'), ['mail a@b.com']);
});

test('stageKey: a poll past its deadline reads as waiting for the date', () => {
  const now = Date.parse('2026-10-13T06:00:00Z');
  assert.equal(stageKey({ stage: 'poll', voteDeadline: '2026-10-13T05:00:00Z' }, now), 'pollClosed');
  assert.equal(stageKey({ stage: 'poll', voteDeadline: '2026-10-14T05:00:00Z' }, now), 'poll');
  assert.equal(stageKey({ stage: 'poll', voteDeadline: null }, now), 'poll');
  assert.equal(stageKey({ stage: 'rsvp', voteDeadline: '2026-10-13T05:00:00Z' }, now), 'rsvp');
  assert.equal(stageKey({ stage: 'rsvp', startsAt: '2026-10-13T05:00:00Z' }, now), 'awaitingBill');
});

test('compareDays: ties go to the day more honorees can make, then the earlier day', () => {
  const rs = [
    { memberId: 1, days: ['2026-10-19', '2026-10-22'] },
    { memberId: 2, days: ['2026-10-22'] },
    { memberId: 3, days: ['2026-10-19'] },
  ];
  const byHonoree = compareDays(['2026-10-19', '2026-10-22', '2026-10-23'], rs, [2]);
  assert.deepEqual(byHonoree.ranked.map((d) => d.day), ['2026-10-22', '2026-10-19', '2026-10-23']);
  assert.equal(byHonoree.tie, 'honorees');
  assert.deepEqual(byHonoree.ranked[0]!.honoreesIn, [2]);
  assert.equal(compareDays(['2026-10-22', '2026-10-19'], rs).ranked[0]!.day, '2026-10-19');
  assert.equal(compareDays(['2026-10-22', '2026-10-19'], rs).tie, 'earlier');
  assert.equal(compareDays(['2026-10-19', '2026-10-23'], rs).tie, null);
  assert.equal(compareDays(['2026-10-24', '2026-10-25'], rs).tie, null);
});

const team = [{ id: 1, name: 'An' }, { id: 2, name: 'Binh' }, { id: 3, name: 'Chi' }, { id: 4, name: 'Dung', archivedAt: new Date() }];
const rrow = (memberId: number, o: Partial<{ days: string[]; venueIds: number[]; status: string | null; derived: string | null; guests: number; paidAt: unknown; paidAmount: number | null; sponsorAmount: number | null }> = {}) =>
  ({ memberId, days: [], venueIds: [], status: null, derived: null, guests: 0, paidAt: null, ...o });

test('reminderOf poll: names who have not voted, archived members skipped', () => {
  const rs = [rrow(1, { days: ['2026-10-01'] })];
  assert.deepEqual(reminderOf('poll', team, rs, [], null, []), { kind: 'poll', names: ['Binh', 'Chi'], confirm: [] });
  const all = [rrow(1, { days: ['d'] }), rrow(2, { status: 'no' }), rrow(3, { venueIds: [1] })];
  assert.deepEqual(reminderOf('poll', team, all, [], null, [])?.names, []);
});

test('reminderOf names only the roster it is given: participants of the event, not the whole team', () => {
  const participants = [team[0]!, team[2]!];
  assert.deepEqual(reminderOf('poll', participants, [], [], null, [])?.names, ['An', 'Chi']);
  assert.deepEqual(reminderOf('rsvp', participants, [], [], null, [])?.names, ['An', 'Chi']);
  assert.deepEqual(reminderOf('bill', participants, [rrow(1, { status: 'going' }), rrow(2, { status: 'going' })], [1, 2], 50_000, [])?.names, ['An']);
});

test('reminderOf rsvp: unanswered vs held seats that need confirming', () => {
  const rs = [rrow(1, { status: 'going', derived: 'going' }), rrow(2, { status: 'going', derived: 'reconfirm' })];
  assert.deepEqual(reminderOf('rsvp', team, rs, [1], null, [2]), { kind: 'rsvp', names: ['Chi'], confirm: ['Binh'] });
  const answered = [rrow(1, { status: 'going' }), rrow(2, { status: 'no' }), rrow(3, { status: 'maybe' })];
  assert.deepEqual(reminderOf('rsvp', team, answered, [1], null, []), { kind: 'rsvp', names: [], confirm: [] });
});

test('reminderOf rsvp: a lapsed hold (derived reconfirm but no longer held) is asked again, not told to confirm', () => {
  const rs = [rrow(2, { status: 'going', derived: 'reconfirm' })];
  assert.deepEqual(reminderOf('rsvp', team, rs, [], null, []), { kind: 'rsvp', names: ['An', 'Binh', 'Chi'], confirm: [] });
});

test('reminderOf rsvp: a lapsed holder is in names only, a live holder in confirm only', () => {
  const rs = [rrow(1, { status: 'going', derived: 'going' }), rrow(2, { status: 'going', derived: 'reconfirm' }), rrow(3, { status: 'going', derived: 'reconfirm' })];
  const r = reminderOf('rsvp', team, rs, [1], null, [3])!;
  assert.deepEqual(r.names, ['Binh']);
  assert.deepEqual(r.confirm, ['Chi']);
});

test('reminderOf bill: confirmed attendees who still owe, guests count, legacy paid and part payments handled', () => {
  const rs = [rrow(1, { status: 'going', paidAt: new Date() }), rrow(2, { status: 'going', guests: 1, paidAmount: 50_000 }), rrow(3, { status: 'going' })];
  assert.deepEqual(reminderOf('bill', team, rs, [1, 2, 3, 4], 50_000, []), { kind: 'bill', names: ['Binh', 'Chi'], confirm: [] });
  assert.equal(reminderOf('bill', team, rs, [1, 2, 3], null, []), null);
  assert.deepEqual(reminderOf('bill', team, [rrow(2, { status: 'going', paidAmount: 50_000 })], [2], 25_000, [])?.names, []);
  assert.equal(reminderOf('settled', team, rs, [1], 1000, []), null);
});

test('sponsors flow through mineOf, allPaid and reminderOf', () => {
  const sponsor = { status: 'going', guests: 0, sponsorAmount: 500_000, paidAt: null, paidAmount: null, days: [], venueIds: [] };
  assert.equal(mineOf(sponsor, true, false, 100_000)!.owes, 500_000);
  assert.equal(allPaid([{ guests: 0, sponsorAmount: 500_000, paidAt: null, paidAmount: 500_000 }, { guests: 0, paidAt: null, paidAmount: 100_000 }], 100_000), true);
  assert.equal(allPaid([{ guests: 0, sponsorAmount: 500_000, paidAt: null, paidAmount: 100_000 }], 100_000), false, 'a sponsor owes their fixed amount, not a share');
  const rs = [rrow(1, { status: 'going', sponsorAmount: 500_000, paidAmount: 100_000 }), rrow(2, { status: 'going', paidAmount: 100_000 })];
  assert.deepEqual(reminderOf('bill', team, rs, [1, 2], 100_000, [])?.names, ['An']);
});

test('a PIN is six digits that are not all alike and not a run', () => {
  assert.equal(pinProblem('482916'), null);
  assert.equal(pinProblem('135790'), null);
  for (const bad of ['', '12345', '1234567', '12a456', 482916 as unknown]) assert.equal(pinProblem(bad), 'format');
  for (const weak of ['111111', '000000', '123456', '234567', '654321', '987654']) assert.equal(pinProblem(weak), 'weak');
});

test('mapEmbedUrl: coordinates, short links, non-Google and junk', () => {
  assert.match(mapEmbedUrl('Foo', 'https://www.google.com/maps/place/Foo/@10.77,106.70,17z')!, /q=10\.77%2C106\.70&/);
  assert.match(mapEmbedUrl('Quán Ụt Ụt', 'https://maps.app.goo.gl/abc')!, new RegExp(`q=${encodeURIComponent('Quán Ụt Ụt')}&`));
  for (const link of ['https://pizza4ps.com', 'https://goo.gl/xyz', null, '', 'not a url']) assert.equal(mapEmbedUrl('Foo', link), null);
});

test('placeName: the name from a full Google Maps place link, else null', () => {
  assert.equal(placeName("https://www.google.com/maps/place/Pizza+4P's+Ben+Thanh/@10.77,106.70,17z/data=!3m1"), "Pizza 4P's Ben Thanh");
  assert.equal(placeName('https://www.google.com/maps/place/Qu%C3%A1n+%E1%BB%A4t+%E1%BB%A4t?entry=ttu'), 'Quán Ụt Ụt');
  for (const link of ['https://maps.app.goo.gl/abc', 'https://www.google.com/maps/@10.77,106.70,17z', 'https://example.com', null, '']) assert.equal(placeName(link), null);
});

test('dateBlock: vi month reads "thg 10" and the weekday comes from the fixed table on every runtime, en stays short', () => {
  assert.deepEqual(dateBlock('2026-10-19T11:30:00Z', 'vi'), { weekday: 'Thứ 2', day: '19', month: 'thg 10' });
  // 18:00 UTC on the 18th is already Monday the 19th in Vietnam time.
  assert.deepEqual(dateBlock('2026-10-18T18:00:00Z', 'en'), { weekday: 'Mon', day: '19', month: 'Oct' });
});

test('guestLimit: an event with no limit allows the ceiling of 10', () => {
  assert.equal(guestLimit({ maxGuests: null }), 10);
  assert.equal(guestLimit({ maxGuests: 0 }), 0);
  assert.equal(guestLimit({ maxGuests: 3 }), 3);
});

const ballot = (memberId: number, days: string[] = [], venueIds: number[] = [], status: string | null = null) => ({ memberId, days, venueIds, status });
const spot = (id: number, min: number, upvotes: number[]) => ({ id, createdAt: at(min), upvotes, maybe: [] as number[] });

test('hasVoted: a day, a place (yes or if need be) or declining counts; an RSVP maybe or an empty row does not', () => {
  assert.equal(hasVoted(ballot(1, ['2026-10-20'])), true);
  assert.equal(hasVoted(ballot(1, [], [4])), true);
  assert.equal(hasVoted(ballot(1, [], [], 'no')), true);
  assert.equal(hasVoted(ballot(1, [], [], 'maybe')), false);
  assert.equal(hasVoted(ballot(1)), false);
});

test('hasVoted and hasPicked: an "if need be" day or place is a vote; declining is an answer but not a pick', () => {
  assert.equal(hasVoted({ ...ballot(1), maybeDays: ['2026-10-20'] }), true);
  assert.equal(hasVoted({ ...ballot(1), maybeVenueIds: [4] }), true);
  assert.equal(hasPicked({ ...ballot(1), maybeVenueIds: [4] }), true);
  assert.equal(hasPicked(ballot(1, [], [], 'no')), false);
  assert.equal(hasPicked({ ...ballot(1), maybeDays: [], maybeVenueIds: [] }), false);
});

test('pendingVoters: someone who only picked "if need be" has answered', () => {
  const rs = [{ memberId: 1, days: [], venueIds: [], maybeDays: ['2026-10-01'], maybeVenueIds: [] }, { memberId: 2, days: [], venueIds: [], maybeDays: [], maybeVenueIds: [] }];
  assert.deepEqual(pendingVoters([{ id: 1 }, { id: 2 }], rs), [{ id: 2 }]);
});

test('planFit: yes beats if-need-be; the weaker of day and place decides; no pick on a polled place leaves the day alone', () => {
  const day = '2026-10-23';
  const m = (days: string[], maybeDays: string[], venueIds: number[] = [], maybeVenueIds: number[] = []) => ({ days, maybeDays, venueIds, maybeVenueIds });
  assert.equal(planFit(m([day], []), plan(day)), 'yes');
  assert.equal(planFit(m([], [day]), plan(day)), 'maybe');
  assert.equal(planFit(m(['2026-10-24'], [day]), plan(day)), 'maybe');
  assert.equal(planFit(m([], []), plan(day)), 'no');
  assert.equal(planFit(m([day], [], [1]), plan(day, [1])), 'yes');
  assert.equal(planFit(m([day], [], [], [1]), plan(day, [1])), 'maybe');
  assert.equal(planFit(m([], [day], [1]), plan(day, [1])), 'maybe');
  assert.equal(planFit(m([day], [], [2], [1]), plan(day, [1])), 'maybe');
  assert.equal(planFit(m([day], [], [2]), plan(day, [1])), 'no');
  assert.equal(planFit(m([day], []), plan(day, [1])), 'yes');
  assert.equal(planFit(m([], [], [], [1]), plan(null, [1])), 'maybe');
  assert.equal(planFit(m([], [], [1]), plan(null, [1])), 'yes');
  assert.equal(planFit(m([], [day], [], [1]), plan(null, [])), 'no');
});

test('matchesPlan: an "if need be" match is not a fit', () => {
  assert.equal(matchesPlan({ days: [], venueIds: [], maybeDays: ['2026-10-23'] }, plan('2026-10-23')), false);
  assert.equal(matchesPlan({ days: ['2026-10-23'], venueIds: [], maybeVenueIds: [1] }, plan('2026-10-23', [1])), false);
});

test('deriveAttendance lock: an if-need-be match is not seated, and lockImpact asks that member to confirm', () => {
  const rows = [row(1), row(2, { days: [], maybeDays: ['2026-10-23'] }), row(3, { days: ['2026-10-24'], maybeDays: ['2026-10-23'] })];
  const d = deriveAttendance(rows, plan('2026-10-23'), 'lock', NO_HOLDS);
  assert.deepEqual([ids(d.going), ids(d.untouched)], [[1], [2, 3]]);
  const r = lockImpact(rows, plan('2026-10-23'), null, at(99), NO_HOLDS, 'lock');
  assert.deepEqual([ids(r.going), ids(r.confirm)], [[1], [2, 3]]);
});

test('deriveAttendance edit: a derived seat that only fits as if-need-be is held to confirm', () => {
  const ev = { reconfirmBy: new Date(Date.now() + 3600_000) };
  const rows = [row(1, { status: 'going', derived: 'going', days: [], maybeDays: ['2026-10-23'] }), row(2, { status: 'going', derived: 'going' })];
  const d = deriveAttendance(rows, plan('2026-10-23'), 'edit', ev);
  assert.deepEqual([ids(d.hold), ids(d.going)], [[1], [2]]);
});

test('mineOf: an if-need-be pick counts as having voted', () => {
  assert.equal(mineOf({ days: [], venueIds: [], maybeDays: ['2026-10-23'], status: null, guests: 0, paidAt: null }, false, false, null).voted, true);
});

test('compareDays: ranks by yes, then if need be; if-need-be voters are listed apart from yes', () => {
  const rs = [
    { memberId: 1, days: ['2026-10-19'], maybeDays: [] },
    { memberId: 2, days: ['2026-10-20'], maybeDays: ['2026-10-19'] },
    { memberId: 3, days: ['2026-10-20'], maybeDays: [] },
    { memberId: 4, days: ['2026-10-19'], maybeDays: ['2026-10-20'] },
    { memberId: 5, days: [], maybeDays: ['2026-10-19', '2026-10-20'] },
  ];
  const { ranked, tie } = compareDays(['2026-10-19', '2026-10-20'], rs);
  assert.deepEqual(ranked.map((d) => [d.day, d.n, d.maybe]), [['2026-10-19', 2, [2, 5]], ['2026-10-20', 2, [4, 5]]]);
  assert.equal(tie, 'earlier');
  const lead = compareDays(['2026-10-19', '2026-10-20'], [...rs, { memberId: 6, days: [], maybeDays: ['2026-10-20'] }]);
  assert.deepEqual([lead.ranked[0]!.day, lead.tie], ['2026-10-20', null]);
});

test('redactVotes: also clears if-need-be picks and counts, keeps honoree days', () => {
  const rows = [{ ...ballot(1, ['2026-10-20'], [7]), maybeDays: ['2026-10-21'], maybeVenueIds: [8] }, { ...ballot(2, ['2026-10-20']), maybeDays: ['2026-10-21'], maybeVenueIds: [8] }];
  const out = redactVotes(rows, [{ ...spot(8, 1, [1]), maybe: [2] }], 3, [2]);
  assert.deepEqual(out.rows.map((r) => [r.days, r.maybeDays, r.venueIds, r.maybeVenueIds]), [[[], [], [], []], [['2026-10-20'], ['2026-10-21'], [], []]]);
  assert.deepEqual(out.venues.map((v) => [v.upvotes, v.maybe]), [[[], []]]);
});

test('hidesVotes: only for a non-organizer who has not voted, in the poll of an event that asks for it', () => {
  const rows = [ballot(1, ['2026-10-20']), ballot(2)];
  const ev = { hideVotes: true, stage: 'poll' };
  assert.equal(hidesVotes(ev, null, rows, 2), true);
  assert.equal(hidesVotes(ev, null, rows, null), true);
  assert.equal(hidesVotes(ev, null, rows, 1), false);
  assert.equal(hidesVotes(ev, null, [ballot(2, [], [], 'no')], 2), false);
  assert.equal(hidesVotes(ev, 'host', rows, 2), false);
  assert.equal(hidesVotes(ev, 'cohost', rows, 2), false);
  assert.equal(hidesVotes({ ...ev, hideVotes: false }, null, rows, 2), false);
  assert.equal(hidesVotes({ ...ev, stage: 'rsvp' }, null, rows, 2), false);
});

test('redactVotes empties other people picks and counts, keeps honoree days and my own row, and sorts places by age', () => {
  const rows = [ballot(1, ['2026-10-20'], [7]), ballot(2, ['2026-10-21'], [8]), ballot(3, ['2026-10-22'], [7])];
  const out = redactVotes(rows, [spot(8, 5, [2]), spot(7, 1, [1, 3])].sort((a, b) => b.upvotes.length - a.upvotes.length), 3, [2]);
  assert.deepEqual(out.rows.map((r) => [r.memberId, r.days, r.venueIds]), [
    [1, [], []],
    [2, ['2026-10-21'], []],
    [3, ['2026-10-22'], [7]],
  ]);
  assert.deepEqual(out.venues.map((v) => [v.id, v.upvotes]), [[7, []], [8, []]]);
  assert.equal(rows[0]!.days.length, 1, 'the input is not mutated');
});
