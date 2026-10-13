import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanup, day, event, member, query, startServer, stopServer } from './harness.ts';

/** Held seats after a plan change: derive on edit, confirm in time, expiry, no revival, bill entry (plan Phase 4). */
before(startServer);
afterEach(cleanup);
after(stopServer);

const patch = (id: number, key: string | undefined, body: unknown) => api(`/api/events/${id}`, { method: 'PATCH', key, body });
const get = async (id: number) => (await api(`/api/events/${id}`)).body;
const vote = (id: number, memberId: number, days: string[]) => api(`/api/events/${id}/response`, { method: 'PUT', me: memberId, body: { memberId, days } });
const answer = (id: number, memberId: number, status: string | null) => api(`/api/events/${id}/response`, { method: 'PUT', me: memberId, body: { memberId, status } });
const rowOf = async (id: number, memberId: number) =>
  (await query(`SELECT status, derived, going_at FROM responses WHERE event_id = $1 AND member_id = $2`, [id, memberId]))[0]!;
const at = (n: number) => `${day(n)}T12:00:00+07:00`;
const expire = (id: number) => query(`UPDATE events SET reconfirm_by = now() - interval '1 hour' WHERE id = $1`, [id]);

/** A day poll locked on day +10: `a` voted both days (still fits a move to +11), `b` only +10 (held by it). */
async function setup(extra: Record<string, unknown> = {}) {
  const ev = await event(extra);
  const [a, b] = [await member(), await member()];
  await vote(ev.id, a, [day(10), day(11)]);
  await vote(ev.id, b, [day(10)]);
  assert.equal((await patch(ev.id, ev.key, { stage: 'rsvp', startsAt: at(10) })).status, 200);
  return { ...ev, a, b };
}

describe('date moved in the RSVP stage', () => {
  it('keeps matching members, holds the rest with their priority, sets the deadline', async () => {
    const { id, key, a, b } = await setup();
    const [a0, b0] = [await rowOf(id, a), await rowOf(id, b)];
    assert.equal((await patch(id, key, { startsAt: at(11) })).status, 200);
    const [a1, b1] = [await rowOf(id, a), await rowOf(id, b)];
    assert.deepEqual([a1.derived, a1.going_at], ['going', a0.going_at]);
    assert.deepEqual([b1.derived, b1.status, b1.going_at], ['reconfirm', 'going', b0.going_at]);
    const data = await get(id);
    assert.ok(data.event.reconfirmBy);
    assert.deepEqual(data.held, [b]);
    assert.ok(data.confirmed.includes(b));
  });

  it('a held seat blocks the waitlist; declining releases it at once', async () => {
    const { id, key, a, b } = await setup({ capacity: 2 });
    const e = await member();
    await answer(id, e, 'going');
    assert.deepEqual((await get(id)).waitlist, [e]);
    await patch(id, key, { startsAt: at(11) });
    assert.deepEqual((await get(id)).waitlist, [e], 'the held seat of b still counts');
    await answer(id, b, 'no');
    const after = await get(id);
    assert.deepEqual(after.waitlist, []);
    assert.ok(after.confirmed.includes(a) && after.confirmed.includes(e));
  });

  it('confirming in time keeps the original spot', async () => {
    const { id, key, b } = await setup();
    const before = (await rowOf(id, b)).going_at;
    await patch(id, key, { startsAt: at(11) });
    await answer(id, b, 'going');
    const row = await rowOf(id, b);
    assert.deepEqual([row.derived, row.going_at], [null, before]);
  });

  it('confirming after the deadline goes to the back; with more guests too', async () => {
    const { id, key, b } = await setup();
    const before = (await rowOf(id, b)).going_at as Date;
    await patch(id, key, { startsAt: at(11) });
    await expire(id);
    assert.ok(!(await get(id)).confirmed.includes(b));
    await answer(id, b, 'going');
    assert.ok(((await rowOf(id, b)).going_at as Date) > before);

    const other = await setup();
    const beforeGuests = (await rowOf(other.id, other.b)).going_at as Date;
    await patch(other.id, other.key, { startsAt: at(11) });
    await api(`/api/events/${other.id}/response`, { method: 'PUT', me: other.b, body: { memberId: other.b, status: 'going', guests: 1 } });
    assert.ok(((await rowOf(other.id, other.b)).going_at as Date) > beforeGuests);
  });

  it('a member who never answered is not auto-marked by an edit', async () => {
    // c votes before the lock, only for +11, so the lock on +10 leaves them unanswered.
    const { id, key } = await event();
    const c = await member();
    assert.equal((await vote(id, c, [day(11)])).status, 200);
    assert.equal((await patch(id, key, { stage: 'rsvp', startsAt: at(10) })).status, 200);
    assert.equal((await patch(id, key, { startsAt: at(11) })).status, 200);
    assert.deepEqual([(await rowOf(id, c)).status, (await rowOf(id, c)).derived], [null, null]);
  });

  it('moving back to a day the held member picked restores them', async () => {
    const { id, key, b } = await setup();
    const before = (await rowOf(id, b)).going_at;
    await patch(id, key, { startsAt: at(11) });
    await patch(id, key, { startsAt: at(10) });
    const row = await rowOf(id, b);
    assert.deepEqual([row.derived, row.going_at], ['going', before]);
  });
});

describe('deadline rules', () => {
  it('refuses a deadline in the past or after the start', async () => {
    const { id, key } = await setup();
    const past = await patch(id, key, { startsAt: at(11), reconfirmBy: new Date(Date.now() - 60_000).toISOString() });
    assert.equal(past.message, 'invalidDate');
    const late = await patch(id, key, { startsAt: at(11), reconfirmBy: `${day(12)}T12:00:00+07:00` });
    assert.equal(late.message, 'invalidDate');
  });

  it('refuses a plan change that would hold seats with a start that has already passed', async () => {
    const { id, key, b } = await setup();
    const before = await rowOf(id, b);
    const res = await patch(id, key, { startsAt: new Date(Date.now() - 86_400_000).toISOString() });
    assert.equal(res.status, 409);
    assert.equal(res.message, 'reconfirmTooLate');
    assert.deepEqual(await rowOf(id, b), before);
  });

  it('an expired hold is released first and not revived by a later edit that matches it', async () => {
    const { id, key, b } = await setup();
    await patch(id, key, { startsAt: at(11) });
    await expire(id);
    assert.equal((await patch(id, key, { startsAt: at(10) })).status, 200);
    const row = await rowOf(id, b);
    assert.deepEqual([row.status, row.derived], [null, null]);
  });

  it('an expired hold is released even when the same edit holds someone else under a new deadline', async () => {
    const { id, key, a, b } = await setup();
    await patch(id, key, { startsAt: at(11) });
    await expire(id);
    // +12 is no poll day: a no longer fits and is held, which writes a fresh deadline in the same batch.
    assert.equal((await patch(id, key, { startsAt: at(12) })).status, 200);
    assert.deepEqual([(await rowOf(id, b)).status, (await rowOf(id, b)).derived], [null, null]);
    assert.equal((await rowOf(id, a)).derived, 'reconfirm');
    const data = await get(id);
    assert.deepEqual(data.held, [a]);
    assert.ok(!data.confirmed.includes(b));
  });

  it('a hold still in time is restored with its original spot when the date moves back to its day', async () => {
    const { id, key, b } = await setup();
    const before = (await rowOf(id, b)).going_at;
    await patch(id, key, { startsAt: at(11) });
    assert.equal((await patch(id, key, { startsAt: at(10) })).status, 200);
    const row = await rowOf(id, b);
    assert.deepEqual([row.status, row.derived, row.going_at], ['going', 'going', before]);
    const data = await get(id);
    assert.ok(data.confirmed.includes(b));
    assert.equal(data.event.reconfirmBy, null);
  });

  it('a hold still in time survives a second edit that does not match it', async () => {
    const { id, key, b } = await setup();
    const before = (await rowOf(id, b)).going_at;
    await patch(id, key, { startsAt: at(11) });
    await patch(id, key, { startsAt: `${day(11)}T20:00:00+07:00`, venue: 'zz-test-elsewhere' });
    const row = await rowOf(id, b);
    assert.deepEqual([row.derived, row.going_at], ['reconfirm', before]);
  });
});

describe('leaving the RSVP stage', () => {
  it('entering the bill releases pending holds', async () => {
    const { id, key, b } = await setup();
    await patch(id, key, { startsAt: at(11) });
    assert.equal((await patch(id, key, { stage: 'bill', billTotal: 100_000 })).status, 200);
    const row = await rowOf(id, b);
    assert.deepEqual([row.status, row.derived], [null, null]);
    assert.equal((await get(id)).event.reconfirmBy, null);
  });

  it('a cancelled event refuses the edit', async () => {
    const { id, key } = await setup();
    await patch(id, key, { cancel: '' });
    const res = await patch(id, key, { startsAt: at(11) });
    assert.equal(res.message, 'cancelled');
  });
});
