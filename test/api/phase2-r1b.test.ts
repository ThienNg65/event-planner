import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanup, event, query, startServer, stopServer } from './harness.ts';

/** Phase 2 R1b: repeating events. The tick is called through its HTTP trigger, so the server needs the secret. */
const SECRET = 'zz-test-cron-secret';
process.env.CRON_SECRET = SECRET;
before(startServer);
afterEach(async () => {
  // Events the tick created are not tracked by the harness.
  await query(`DELETE FROM events WHERE series_id IN (SELECT id FROM events WHERE title LIKE 'zz-test-%' AND series_id = id) AND id <> series_id`);
  await cleanup();
});
after(stopServer);

const soon = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const repeating = (extra: Record<string, unknown> = {}) => event({ pollDays: [], startsAt: soon(2), venue: 'zz-test-place', repeat: 'weekly', ...extra });
const tick = () => fetch('http://localhost:3999/api/cron/tick', { method: 'POST', headers: { 'x-cron-secret': SECRET } });
const seriesOf = async (id: number) => await query(`SELECT id, starts_at, stage FROM events WHERE series_id = $1 ORDER BY starts_at`, [id]);

describe('creating a repeating event', () => {
  it('needs a fixed date and a place, and starts a series of its own', async () => {
    const ev = await repeating();
    assert.equal((await query(`SELECT series_id FROM events WHERE id = $1`, [ev.id]))[0]!.series_id, ev.id);
    const poll = await api('/api/events', { method: 'POST', me: ev.createdBy, body: { title: 'zz-test-x', pollDays: ['2099-01-01'], repeat: 'weekly' } });
    assert.equal(poll.message, 'repeatNeedsFixedPlan');
    const noPlace = await api('/api/events', { method: 'POST', me: ev.createdBy, body: { title: 'zz-test-x', pollDays: [], startsAt: soon(5), repeat: 'weekly' } });
    assert.equal(noPlace.message, 'repeatNeedsFixedPlan');
    const bad = await api('/api/events', { method: 'POST', me: ev.createdBy, body: { title: 'zz-test-x', pollDays: [], startsAt: soon(5), venue: 'p', repeat: 'daily' } });
    assert.equal(bad.message, 'invalidRepeat');
  });
});

describe('the tick', () => {
  it('creates the next event once the previous one has started, only once, with the same organizers', async () => {
    const ev = await repeating();
    await query(`UPDATE events SET starts_at = now() - interval '1 hour' WHERE id = $1`, [ev.id]);
    assert.equal((await tick()).status, 200);
    assert.equal((await tick()).status, 200);
    const rows = await seriesOf(ev.id);
    assert.equal(rows.length, 2);
    assert.equal(rows[1]!.stage, 'rsvp');
    const made = await api(`/api/events/${rows[1]!.id}`, { me: ev.createdBy });
    assert.equal(made.body.role, 'host');
    assert.equal(made.body.series.prev.id, ev.id);
  });

  it('does not create an event past the until date, and cancelling the latest skips only that date', async () => {
    const ended = await repeating({ repeatUntil: new Date().toISOString().slice(0, 10) });
    await query(`UPDATE events SET starts_at = now() - interval '1 hour' WHERE id = $1`, [ended.id]);
    const cancelled = await repeating();
    await query(`UPDATE events SET starts_at = now() - interval '1 hour', cancelled_at = now() WHERE id = $1`, [cancelled.id]);
    await tick();
    assert.equal((await seriesOf(ended.id)).length, 1);
    assert.equal((await seriesOf(cancelled.id)).length, 2);
  });
});

describe('changing the repeat', () => {
  it('applies to the whole series, and turning it off stops new events', async () => {
    const ev = await repeating();
    await query(`UPDATE events SET starts_at = now() - interval '1 hour' WHERE id = $1`, [ev.id]);
    await tick();
    const [first, second] = await seriesOf(ev.id);
    const off = await api(`/api/events/${second!.id}`, { method: 'PATCH', me: ev.createdBy, key: ev.key, body: { repeat: null } });
    assert.equal(off.status, 200, off.message);
    const r = await query(`SELECT repeat FROM events WHERE series_id = $1`, [first!.id]);
    assert.ok(r.every((x) => x.repeat === null));
  });
});
