import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanup, event, member, query, startServer, stopServer } from './harness.ts';

/**
 * Phase 2 R5: event emails ship switched off. The harness server has no Resend configuration, so the endpoints that would queue
 * a mail (lock, plan edit, correction, bill, organizer-recorded payment, cancel) must work exactly as before and queue nothing.
 * (The queueing SQL and dispatch need a sender and are covered by test/notify.test.ts and the offline SQL checks.)
 */
before(startServer);
afterEach(cleanup);
after(stopServer);

const patch = (id: number, key: string, body: unknown) => api(`/api/events/${id}`, { method: 'PATCH', key, body });
const rsvpEvent = () => event({ pollDays: [], startsAt: new Date(Date.now() + 10 * 86_400_000).toISOString(), venue: 'zz-test-venue' });
const queued = async (id: number) => (await query('SELECT count(*)::int AS n FROM notifications WHERE event_id = $1', [id]))[0]!.n;

describe('with email off nothing is queued', () => {
  it('plan edit, bill, organizer-recorded payment and cancel all succeed and write no notification', async () => {
    const ev = await rsvpEvent();
    const a = await member();
    await api(`/api/events/${ev.id}/response`, { method: 'PUT', me: a, body: { memberId: a, status: 'going' } });

    assert.equal((await patch(ev.id, ev.key, { venue: 'zz-test-else' })).status, 200);
    await query(`UPDATE events SET starts_at = now() - interval '1 hour' WHERE id = $1`, [ev.id]);
    assert.equal((await patch(ev.id, ev.key, { stage: 'bill', billTotal: 100_000 })).status, 200);
    assert.equal((await patch(ev.id, ev.key, { billTotal: 120_000 })).status, 200);
    const paid = await api(`/api/events/${ev.id}/response`, { method: 'PUT', key: ev.key, body: { memberId: a, paid: true } });
    assert.equal(paid.status, 200);
    assert.equal((await patch(ev.id, ev.key, { cancel: 'zz-test' })).status, 200);
    assert.equal(await queued(ev.id), 0);
  });

  it('locking a poll queues nothing', async () => {
    const ev = await event();
    const lock = await patch(ev.id, ev.key, { stage: 'rsvp', startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), venue: 'zz-test-venue' });
    assert.equal(lock.status, 200);
    assert.equal(await queued(ev.id), 0);
  });

  it('cancelling twice keeps the first cancellation time and only changes the reason; restoring clears both', async () => {
    const ev = await rsvpEvent();
    await patch(ev.id, ev.key, { cancel: 'first' });
    const [one] = await query('SELECT cancelled_at, cancel_reason FROM events WHERE id = $1', [ev.id]);
    await patch(ev.id, ev.key, { cancel: 'second' });
    const [two] = await query('SELECT cancelled_at, cancel_reason FROM events WHERE id = $1', [ev.id]);
    assert.equal(String(two!.cancelled_at), String(one!.cancelled_at));
    assert.equal(two!.cancel_reason, 'second');
    await patch(ev.id, ev.key, { restore: true });
    const [three] = await query('SELECT cancelled_at, cancel_reason FROM events WHERE id = $1', [ev.id]);
    assert.deepEqual([three!.cancelled_at, three!.cancel_reason], [null, null]);
  });

  it('the unsubscribe and mute endpoints answer emailOff', async () => {
    const me = await member();
    for (const [path, method, body] of [
      ['/api/unsubscribe?t=x', 'GET', undefined],
      ['/api/unsubscribe?t=x', 'POST', undefined],
      ['/api/me/email/mute', 'POST', { kind: 'planSet', muted: true }],
    ] as const) {
      const res = await api(path, { method, body, me });
      assert.equal(res.status, 404, `${method} ${path}`);
    }
  });
});
