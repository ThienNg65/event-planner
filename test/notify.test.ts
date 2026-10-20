import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audienceOf, afterSendError, billFact, isNotifyKind, MAX_ATTEMPTS, NOTIFY_KINDS, planFact, planSetFact, reachable, reminderFact, retryAt, timeFact, type NoticeEvent, type NoticeRow } from '../shared/utils/notify.ts';
import { NOTIFY_KINDS as TABLE_KINDS } from '../server/db/schema.ts';
import { MAIL_KINDS, renderMail } from '../server/utils/mailTemplates.ts';

const at = (iso: string) => new Date(iso);
const NOW = at('2026-10-20T00:00:00Z').getTime();
const ev = (o: Partial<NoticeEvent> = {}): NoticeEvent => ({ stage: 'rsvp', startsAt: at('2026-10-25T12:00:00Z'), venue: 'Quán A', billTotal: null, capacity: null, cancelledAt: null, reconfirmBy: null, ...o });
const row = (memberId: number, o: Partial<NoticeRow> = {}): NoticeRow => ({
  memberId,
  status: 'going',
  guests: 0,
  goingAt: at(`2026-10-1${memberId}T00:00:00Z`),
  derived: null,
  paidAt: null,
  paidAmount: null,
  ...o,
});
const ids = (a: { memberId: number }[] | null) => a?.map((x) => x.memberId);

test('the outbox kinds are the same in the table and in shared code', () => {
  assert.deepEqual([...TABLE_KINDS], [...NOTIFY_KINDS]);
  assert.ok(isNotifyKind('planSet') && !isNotifyKind('nope') && !isNotifyKind(undefined));
});

test('facts: a change back (A→B→A) is a new fact, the same change twice is not', () => {
  const a = { startsAt: at('2026-10-25T12:00:00Z'), venue: 'Quán A' };
  const b = { startsAt: at('2026-10-26T12:00:00Z'), venue: 'Quán A' };
  assert.notEqual(planSetFact(a, b), planSetFact(b, a));
  assert.equal(planSetFact(a, b), planSetFact({ ...a }, { ...b }));
  assert.equal(planFact({ startsAt: null, venue: null }), '|');
  assert.notEqual(planFact(a), planFact({ ...a, venue: 'Quán B' }));
  assert.notEqual(billFact(100_000, 120_000), billFact(120_000, 100_000));
  assert.equal(billFact(null, 90_000), '→90000');
  assert.equal(timeFact(at('2026-10-20T00:00:00.123Z')), String(at('2026-10-20T00:00:00.123Z').getTime()));
});

test('a payment request carries each member their own amount, a sponsor their fixed one', () => {
  const rows = [row(1, { sponsorAmount: 60_000 }), row(2), row(3, { guests: 1 })];
  const bill = ev({ stage: 'bill', billTotal: 90_000 });
  const a = audienceOf({ kind: 'paymentRequested', fact: billFact(null, 90_000), memberId: null }, bill, rows, NOW);
  assert.deepEqual(a, [{ memberId: 1, owes: 60_000 }, { memberId: 2, owes: 10_000 }, { memberId: 3, owes: 20_000 }]);
});

test('a cancelled event drops every notice except its own cancellation', () => {
  const gone = ev({ cancelledAt: at('2026-10-19T00:00:00Z') });
  const rows = [row(1), row(2)];
  assert.equal(audienceOf({ kind: 'planSet', fact: planSetFact(ev(), ev()), memberId: null }, gone, rows, NOW), null);
  assert.equal(audienceOf({ kind: 'paymentRequested', fact: billFact(null, 1000), memberId: null }, { ...gone, stage: 'bill', billTotal: 1000 }, rows, NOW), null);
  assert.equal(audienceOf({ kind: 'paymentRecorded', fact: '1', memberId: 1 }, gone, rows, NOW), null);
  const fact = timeFact(gone.cancelledAt!);
  assert.deepEqual(ids(audienceOf({ kind: 'cancelled', fact, memberId: null }, gone, rows, NOW)), [1, 2]);
  // restored, or cancelled again later: the old cancellation is stale
  assert.equal(audienceOf({ kind: 'cancelled', fact, memberId: null }, ev(), rows, NOW), null);
  assert.equal(audienceOf({ kind: 'cancelled', fact, memberId: null }, ev({ cancelledAt: at('2026-10-19T05:00:00Z') }), rows, NOW), null);
});

test('plan changed: seated people get it (waitlist too), a stale plan is dropped', () => {
  const before = ev({ startsAt: at('2026-10-24T12:00:00Z') });
  const now = ev({ capacity: 2 });
  const fact = planSetFact(before, now);
  const rows = [row(1), row(2), row(3), row(4, { status: 'maybe' }), row(5, { status: null })];
  assert.deepEqual(ids(audienceOf({ kind: 'planSet', fact, memberId: null }, now, rows, NOW)), [1, 2, 3]);
  // the plan moved on again before this one was sent: this change is no longer current
  assert.equal(audienceOf({ kind: 'planSet', fact, memberId: null }, ev({ venue: 'Quán B' }), rows, NOW), null);
});

test('held seats count only while their deadline has not passed', () => {
  const rows = [row(1), row(2, { derived: 'reconfirm' })];
  const fact = planSetFact(ev(), ev());
  assert.deepEqual(ids(audienceOf({ kind: 'planSet', fact, memberId: null }, ev({ reconfirmBy: at('2026-10-21T00:00:00Z') }), rows, NOW)), [1, 2]);
  assert.deepEqual(ids(audienceOf({ kind: 'planSet', fact, memberId: null }, ev({ reconfirmBy: at('2026-10-19T00:00:00Z') }), rows, NOW)), [1]);
});

test('payment requested: each unpaid seat holder with their own amount, nobody else', () => {
  const n = { kind: 'paymentRequested', fact: billFact(null, 300_000), memberId: null } as const;
  const bill = ev({ stage: 'bill', billTotal: 300_000 });
  // 5 seats (member 2 brings a guest) → 60,000 each; member 3 has paid in full, member 5 is not coming
  const rows = [row(1), row(2, { guests: 1 }), row(3, { paidAt: at('2026-10-20T00:00:00Z') }), row(4), row(5, { status: 'no' })];
  assert.deepEqual(audienceOf(n, bill, rows, NOW), [
    { memberId: 1, owes: 60_000 },
    { memberId: 2, owes: 120_000 },
    { memberId: 4, owes: 60_000 },
  ]);
  // 2 seats → 150,000 each; a part payment leaves the rest
  const partly = [row(1, { paidAmount: 40_000, paidAt: at('2026-10-20T00:00:00Z') }), row(2)];
  assert.deepEqual(audienceOf(n, bill, partly, NOW), [
    { memberId: 1, owes: 110_000 },
    { memberId: 2, owes: 150_000 },
  ]);
  // the total changed since, or the event is not in the bill stage any more: stale
  assert.equal(audienceOf(n, ev({ stage: 'bill', billTotal: 400_000 }), rows, NOW), null);
  assert.equal(audienceOf(n, ev({ stage: 'rsvp', billTotal: 300_000 }), rows, NOW), null);
  // a waitlisted member owes nothing yet
  assert.deepEqual(ids(audienceOf(n, { ...bill, capacity: 1 }, rows, NOW)), [1]);
});

test('payment recorded: only the payer, only while that payment stands', () => {
  const paidAt = at('2026-10-20T01:00:00.500Z');
  const n = { kind: 'paymentRecorded', fact: timeFact(paidAt), memberId: 2 } as const;
  const bill = ev({ stage: 'bill' });
  assert.deepEqual(audienceOf(n, bill, [row(1), row(2, { paidAt })], NOW), [{ memberId: 2 }]);
  assert.equal(audienceOf(n, bill, [row(2)], NOW), null);
  assert.equal(audienceOf(n, bill, [row(2, { paidAt: at('2026-10-20T02:00:00Z') })], NOW), null);
  assert.equal(audienceOf(n, bill, [row(1, { paidAt })], NOW), null);
});

test('recipients need a verified address and the kind not muted', () => {
  const contacts = new Map([
    [1, { email: 'a@x.vn', locale: 'vi', muted: [] as string[] }],
    [2, { email: 'b@x.vn', locale: 'en', muted: ['planSet'] }],
    [3, { email: 'c@x.vn', locale: 'vi', muted: ['cancelled'] }],
  ]);
  const aud = [{ memberId: 1 }, { memberId: 2 }, { memberId: 3 }, { memberId: 4 }];
  assert.deepEqual(reachable(aud, contacts, 'planSet').map((r) => r.memberId), [1, 3]);
  assert.deepEqual(reachable(aud, contacts, 'cancelled').map((r) => r.memberId), [1, 2]);
  assert.deepEqual(reachable([{ memberId: 2, owes: 5000 }], contacts, 'paymentRequested')[0], { memberId: 2, owes: 5000, email: 'b@x.vn', locale: 'en', muted: ['planSet'] });
});

test('a mail refused for budget is given back; any other failure counts as sent (at most once)', () => {
  assert.equal(afterSendError({ statusCode: 429, statusMessage: 'mailBudget' }), 'defer');
  assert.equal(afterSendError({ statusCode: 502, statusMessage: 'mailFailed' }), 'lose');
  assert.equal(afterSendError(new Error('boom')), 'lose');
  assert.equal(afterSendError(undefined), 'lose');
});

test('retries back off and stop after the limit', () => {
  const now = at('2026-10-20T00:00:00Z');
  assert.equal(retryAt(1, now)!.getTime() - now.getTime(), 10 * 60_000);
  assert.equal(retryAt(3, now)!.getTime() - now.getTime(), 30 * 60_000);
  assert.equal(retryAt(MAX_ATTEMPTS, now), null);
});

test('notification mails: every kind in both languages, the amount only in the personal payment request', () => {
  assert.ok(NOTIFY_KINDS.every((k) => (MAIL_KINDS as readonly string[]).includes(k)));
  for (const lang of ['vi', 'en']) {
    const d = JSON.parse(readFileSync(new URL(`../i18n/locales/${lang}.json`, import.meta.url), 'utf8'));
    const tr = (k: string, p: Record<string, unknown> = {}) => (k.split('.').reduce((o: any, x) => o?.[x], d) as string).replace(/\{(\w+)\}/g, (_, n) => String(p[n]));
    for (const kind of NOTIFY_KINDS) {
      const asked = kind === 'paymentRequested';
      const m = renderMail(tr, kind, {
        title: 'Tiệc',
        name: 'Tu',
        when: 'T6 19:00',
        place: 'Quán A',
        amount: asked ? '334.000 ₫' : '',
        link: asked ? 'https://img.vietqr.io/x' : '',
        link2: 'https://x.test/e/7',
        unsubscribe: 'https://x.test/api/unsubscribe?t=1',
      });
      assert.ok(!m.text.includes('undefined') && !m.html.includes('undefined'), `${lang} ${kind}`);
      assert.ok(m.text.includes('https://x.test/e/7') && m.text.includes('https://x.test/api/unsubscribe?t=1'), `${lang} ${kind} links`);
      assert.equal(/334/.test(m.subject + m.text), asked, `${lang} ${kind} amount`);
      assert.ok(d.mail.kinds[kind], `${lang} mail.kinds.${kind}`);
    }
    assert.ok(d.mail.unsubscribe.title && d.mail.unsubscribe.body.includes('{what}') && d.mail.unsubscribe.done.includes('{what}') && d.mail.unsubscribe.button && d.err.unsubscribeInvalid);
    assert.ok(d.email.notifyTitle && d.email.notifyIntro);
  }
});

test('event tomorrow: seated people only, dropped if the start moved or the event went back to the poll', () => {
  const now = ev({ capacity: 2 });
  const n = { kind: 'tomorrow', fact: timeFact(now.startsAt!), memberId: null } as const;
  const rows = [row(1), row(2), row(3), row(4, { status: 'maybe' })];
  assert.deepEqual(ids(audienceOf(n, now, rows, NOW)), [1, 2]);
  assert.equal(audienceOf(n, ev({ startsAt: at('2026-10-26T12:00:00Z') }), rows, NOW), null);
  assert.equal(audienceOf(n, ev({ stage: 'poll' }), rows, NOW), null);
  assert.equal(audienceOf(n, ev({ cancelledAt: at('2026-10-19T00:00:00Z') }), rows, NOW), null);
});

test('payment reminder: unpaid seat holders for the current total only', () => {
  const bill = ev({ stage: 'bill', billTotal: 200_000 });
  const rows = [row(1), row(2, { paidAt: at('2026-10-20T00:00:00Z') })];
  const n = { kind: 'paymentReminder', fact: reminderFact(200_000, 1), memberId: null } as const;
  assert.deepEqual(audienceOf(n, bill, rows, NOW), [{ memberId: 1, owes: 100_000 }]);
  assert.equal(audienceOf(n, ev({ stage: 'bill', billTotal: 250_000 }), rows, NOW), null);
  assert.equal(audienceOf(n, ev({ stage: 'settled', billTotal: 200_000 }), rows, NOW), null);
  assert.notEqual(reminderFact(200_000, 1), reminderFact(200_000, 2));
});
