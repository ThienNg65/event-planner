import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReminderHour, reminderDue, runTick, tomorrowWindowVN } from '../server/utils/tick.ts';

test('reminder hour is the 02:00 UTC hour (09:00 Vietnam)', () => {
  assert.equal(isReminderHour(new Date('2026-10-15T02:00:00Z')), true);
  assert.equal(isReminderHour(new Date('2026-10-15T02:59:59Z')), true);
  assert.equal(isReminderHour(new Date('2026-10-15T03:00:00Z')), false);
  assert.equal(isReminderHour(new Date('2026-10-15T01:59:59Z')), false);
});

test('tomorrow in Vietnam time, including when UTC is still on the previous day', () => {
  // 20:00 UTC on the 15th is 03:00 on the 16th in Vietnam, so tomorrow is the 17th.
  const w = tomorrowWindowVN(new Date('2026-10-15T20:00:00Z'));
  assert.equal(w.start.toISOString(), '2026-10-16T17:00:00.000Z');
  assert.equal(w.end.toISOString(), '2026-10-17T17:00:00.000Z');
  const noon = tomorrowWindowVN(new Date('2026-10-15T05:00:00Z'));
  assert.equal(noon.start.toISOString(), '2026-10-15T17:00:00.000Z');
});

test('payment reminders: day 2 then day 5, never a third', () => {
  const asked = new Date('2026-10-10T02:00:00Z');
  const at = (days: number) => new Date(asked.getTime() + days * 86400_000);
  assert.equal(reminderDue(asked, at(1.9), 0), null);
  assert.equal(reminderDue(asked, at(2), 0), 1);
  assert.equal(reminderDue(asked, at(4.9), 1), null);
  assert.equal(reminderDue(asked, at(5), 1), 2);
  assert.equal(reminderDue(asked, at(30), 2), null);
});

test('a failing tick job does not stop the others and is reported', async () => {
  const ran: string[] = [];
  const now = new Date('2026-10-15T02:00:00Z');
  const summary = await runTick(now, [
    { name: 'a', run: async () => void ran.push('a') },
    { name: 'b', run: async () => { throw new Error('boom'); } },
    { name: 'c', run: async () => void ran.push('c') },
  ]);
  assert.deepEqual(ran, ['a', 'c']);
  assert.deepEqual(summary.jobs, [
    { name: 'a', ok: true },
    { name: 'b', ok: false, error: 'boom' },
    { name: 'c', ok: true },
  ]);
  assert.equal(summary.at, now.toISOString());
});
