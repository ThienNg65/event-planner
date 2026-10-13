import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanup, cohostKey, event, member, query, startServer, stopServer } from './harness.ts';

/** Completing without a bill or with debts, paying after Completed, and the frozen plan with its correction (plan Phases 6 and 7). */
before(startServer);
afterEach(cleanup);
after(stopServer);

const patch = (id: number, key: string | undefined, body: unknown) => api(`/api/events/${id}`, { method: 'PATCH', key, body });
const rsvpEvent = () => event({ pollDays: [], startsAt: new Date(Date.now() + 10 * 86_400_000).toISOString(), venue: 'zz-test-venue' });
const start = (id: number) => query(`UPDATE events SET starts_at = now() - interval '1 hour' WHERE id = $1`, [id]);
const rows = (id: number) => query(`SELECT * FROM responses WHERE event_id = $1 ORDER BY member_id`, [id]);

describe('complete without a bill', () => {
  it('works once the event has started, and is refused before or with a bill', async () => {
    const early = await rsvpEvent();
    const tooSoon = await patch(early.id, early.key, { stage: 'settled' });
    assert.deepEqual([tooSoon.status, tooSoon.message], [409, 'notStarted']);

    const billed = await rsvpEvent();
    await start(billed.id);
    const withBill = await patch(billed.id, billed.key, { stage: 'settled', billTotal: 1000 });
    assert.deepEqual([withBill.status, withBill.message], [409, 'stageClosed']);

    const ev = await rsvpEvent();
    await start(ev.id);
    assert.equal((await patch(ev.id, ev.key, { stage: 'settled' })).status, 200);
  });
});

describe('complete with debts, pay after', () => {
  async function owing() {
    const ev = await rsvpEvent();
    const a = await member();
    await api(`/api/events/${ev.id}/response`, { method: 'PUT', me: a, body: { memberId: a, status: 'going' } });
    await start(ev.id);
    await patch(ev.id, ev.key, { stage: 'bill', billTotal: 100_000 });
    return { ...ev, a };
  }

  it('a co-host completes with the debt open; the debtor can still report a payment but not set amounts', async () => {
    const ev = await owing();
    const co = await cohostKey(ev.id, ev.key);
    assert.equal((await patch(ev.id, co, { stage: 'settled' })).status, 200);
    const put = (body: object, key?: string) => api(`/api/events/${ev.id}/response`, { method: 'PUT', me: ev.a, key, body: { memberId: ev.a, ...body } });
    assert.equal((await put({ addPaid: 40_000 })).status, 200);
    assert.equal((await put({ paidAmount: null })).status, 409);
    assert.equal((await put({ paidAmount: null }, ev.key)).status, 200);
  });
});

describe('frozen date and place', () => {
  it('refuses date and place edits once started or billed, but not other fields', async () => {
    const ev = await rsvpEvent();
    await start(ev.id);
    for (const body of [{ startsAt: new Date(Date.now() + 86_400_000).toISOString() }, { venue: 'zz-test-else' }, { venueLink: 'https://example.com' }]) {
      const res = await patch(ev.id, ev.key, body);
      assert.deepEqual([res.status, res.message], [409, 'planFrozen']);
    }
    assert.equal((await patch(ev.id, ev.key, { title: 'zz-test-renamed' })).status, 200);
    await patch(ev.id, ev.key, { stage: 'bill', billTotal: 1000 });
    assert.equal((await patch(ev.id, ev.key, { venue: 'zz-test-else' })).message, 'planFrozen');
    assert.equal((await patch(ev.id, ev.key, { billTotal: 2000 })).status, 200);
  });

  it('host and co-host can correct it with a notice, and responses stay identical', async () => {
    const ev = await rsvpEvent();
    const a = await member();
    await api(`/api/events/${ev.id}/response`, { method: 'PUT', me: a, body: { memberId: a, status: 'going' } });
    await start(ev.id);
    const before = await rows(ev.id);
    const co = await cohostKey(ev.id, ev.key);
    const next = new Date(Date.now() - 3_600_000).toISOString();
    assert.equal((await patch(ev.id, ev.key, { correct: true, startsAt: next, notice: 'Typo in the time' })).status, 200);
    assert.equal((await patch(ev.id, co, { correct: true, venue: 'zz-test-right', notice: 'Wrong venue' })).status, 200);
    assert.deepEqual(await rows(ev.id), before);
    const [row] = await query(`SELECT notice, notice_at FROM events WHERE id = $1`, [ev.id]);
    assert.equal(row!.notice, 'Wrong venue');
    assert.ok(row!.notice_at);
  });

  it('enforces its rules: role, notice, frozen, fields', async () => {
    const ev = await rsvpEvent();
    const body = { correct: true, venue: 'zz-test-x', notice: 'why' };
    assert.equal((await patch(ev.id, undefined, body)).status, 403);
    await start(ev.id);
    assert.equal((await patch(ev.id, ev.key, { correct: true, venue: 'zz-test-x' })).status, 400);
    assert.equal((await patch(ev.id, ev.key, { ...body, notice: '   ' })).status, 400);
    assert.equal((await patch(ev.id, ev.key, { ...body, billTotal: 5 })).status, 400);
    assert.equal((await patch(ev.id, ev.key, { correct: true, notice: 'why' })).status, 400);

    const open = await event({ pollDays: [], startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), venue: 'zz-test-venue' });
    assert.equal((await patch(open.id, open.key, body)).status, 409);

    await patch(ev.id, ev.key, { cancel: '' });
    assert.equal((await patch(ev.id, ev.key, body)).message, 'cancelled');
  });
});
