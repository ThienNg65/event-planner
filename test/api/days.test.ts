import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, assertInvariants, cleanup, cohostKey, day, event, member, query, startServer, stopServer, transaction } from './harness.ts';

/** Slice 1B: day edits as a diff, and votes that stay consistent with the days and places under concurrent writes (plan §10.2, §13.2). */
before(startServer);
afterEach(cleanup);
after(stopServer);

const patch = (id: number, key: string | undefined, body: unknown, me?: number) => api(`/api/events/${id}`, { method: 'PATCH', key, me, body });
const vote = (id: number, me: number, body: Record<string, unknown>) => api(`/api/events/${id}/response`, { method: 'PUT', me, body: { memberId: me, ...body } });
const suggest = (id: number, me: number, d: string) => api(`/api/events/${id}/days`, { method: 'POST', me, body: { memberId: me, day: d } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => day(from + i));

/** The candidate days and each member's votes as the API reports them. */
async function state(id: number) {
  const { body } = await api(`/api/events/${id}`);
  return { days: body.event.pollDays as string[], votes: Object.fromEntries(body.responses.map((r: { memberId: number; days: string[]; venueIds: number[] }) => [r.memberId, r])) };
}

/** Whether `p` is still waiting after `ms`: a request held back by a lock. */
const stillPending = async (p: Promise<unknown>, ms = 500) => (await Promise.race([p.then(() => false), sleep(ms).then(() => true)])) as boolean;

describe('day edits', () => {
  it('adds and removes in one request', async () => {
    const ev = await event();
    const res = await patch(ev.id, ev.key, { addDays: [day(12)], removeDays: [day(10)] });
    assert.equal(res.status, 200);
    assert.deepEqual((await state(ev.id)).days, [day(11), day(12)]);
  });

  it('removing a voted day deletes its votes and keeps the others', async () => {
    const ev = await event();
    const m = await member();
    assert.equal((await vote(ev.id, m, { days: [day(10), day(11)] })).status, 200);
    assert.equal((await patch(ev.id, ev.key, { removeDays: [day(10)] })).status, 200);
    assert.deepEqual((await state(ev.id)).votes[m].days, [day(11)]);
  });

  it('removing the last day → 400 daysRequired, nothing changes', async () => {
    const ev = await event();
    const res = await patch(ev.id, ev.key, { removeDays: [day(10), day(11)] });
    assert.equal(res.status, 400);
    assert.equal(res.message, 'daysRequired');
    assert.deepEqual((await state(ev.id)).days, [day(10), day(11)]);
  });

  it('pollDays: [] during the poll → 400 daysRequired', async () => {
    const ev = await event();
    const res = await patch(ev.id, ev.key, { pollDays: [] });
    assert.equal(res.status, 400);
    assert.equal(res.message, 'daysRequired');
  });

  it('pollDays still replaces the list (compatibility) and prunes votes', async () => {
    const ev = await event();
    const m = await member();
    await vote(ev.id, m, { days: [day(10)] });
    assert.equal((await patch(ev.id, ev.key, { pollDays: [day(11), day(13)] })).status, 200);
    const s = await state(ev.id);
    assert.deepEqual(s.days, [day(11), day(13)]);
    assert.deepEqual(s.votes[m].days, []);
  });

  it('a past day → 400 invalidDays', async () => {
    const ev = await event();
    const res = await patch(ev.id, ev.key, { addDays: [day(-3)] });
    assert.equal(res.status, 400);
    assert.equal(res.message, 'invalidDays');
  });

  it('a 21st day → 409 tooManyDays', async () => {
    const ev = await event({ pollDays: range(10, 20) });
    const res = await patch(ev.id, ev.key, { addDays: [day(40)] });
    assert.equal(res.status, 409);
    assert.equal(res.message, 'tooManyDays');
    assert.equal((await state(ev.id)).days.length, 20);
  });

  it('a participant → 403, a co-host → 200', async () => {
    const ev = await event();
    const m = await member();
    assert.equal((await patch(ev.id, undefined, { addDays: [day(12)] }, m)).status, 403);
    assert.equal((await patch(ev.id, undefined, { removeDays: [day(10)] })).status, 403);
    assert.equal((await patch(ev.id, await cohostKey(ev.id, ev.key), { addDays: [day(12)] })).status, 200);
  });

  it('after the poll → 409 stageClosed', async () => {
    const ev = await event({ pollDays: [], startsAt: new Date(Date.now() + 10 * 86_400_000).toISOString(), venue: 'zz-test-venue' });
    const res = await patch(ev.id, ev.key, { addDays: [day(12)] });
    assert.equal(res.status, 409);
    assert.equal(res.message, 'stageClosed');
  });
});

describe('stale votes', () => {
  it('a PUT naming a removed day → 409 daysChanged, the day is not stored, the rest is', async () => {
    const ev = await event();
    const m = await member();
    await patch(ev.id, ev.key, { removeDays: [day(10)] });
    const res = await vote(ev.id, m, { days: [day(10), day(11)] });
    assert.equal(res.status, 409);
    assert.equal(res.message, 'daysChanged');
    assert.deepEqual((await state(ev.id)).votes[m].days, [day(11)]);
  });

  it('a malformed day is still 400 invalidDays', async () => {
    const ev = await event();
    const m = await member();
    assert.equal((await vote(ev.id, m, { days: ['soon'] })).message, 'invalidDays');
  });
});

describe('concurrency (plan §13.2)', () => {
  it('1. an edit in flight blocks a vote, which then answers 409 against the edited list', async () => {
    const ev = await event();
    const m = await member();
    const tx = await transaction();
    try {
      await tx.query('UPDATE events SET poll_days = array_remove(poll_days, $2::date) WHERE id = $1', [ev.id, day(10)]);
      const put = vote(ev.id, m, { days: [day(10), day(11)] });
      assert.ok(await stillPending(put), 'the vote should wait for the edit');
      await tx.commit();
      const res = await put;
      assert.equal(res.status, 409);
      assert.equal(res.message, 'daysChanged');
    } finally {
      await tx.rollback().catch(() => {});
    }
    assert.deepEqual((await state(ev.id)).votes[m].days, [day(11)]);
  });

  it('2. a vote in flight blocks an edit, which then removes that vote too', async () => {
    const ev = await event();
    const m = await member();
    const tx = await transaction();
    try {
      await tx.query('SELECT 1 FROM events WHERE id = $1 FOR SHARE', [ev.id]);
      await tx.query('INSERT INTO responses (event_id, member_id, days) VALUES ($1, $2, $3::date[])', [ev.id, m, [day(10), day(11)]]);
      const edit = patch(ev.id, ev.key, { removeDays: [day(10)] });
      assert.ok(await stillPending(edit), 'the edit should wait for the vote');
      await tx.commit();
      assert.equal((await edit).status, 200);
    } finally {
      await tx.rollback().catch(() => {});
    }
    const s = await state(ev.id);
    assert.deepEqual(s.days, [day(11)]);
    assert.deepEqual(s.votes[m].days, [day(11)]);
  });

  it('3. a suggestion and a removal at once: the suggested day and its vote survive, the removed day is gone', async () => {
    const ev = await event();
    const [voter, suggester] = [await member(), await member()];
    await vote(ev.id, voter, { days: [day(10)] });
    const [add, del] = await Promise.all([suggest(ev.id, suggester, day(12)), patch(ev.id, ev.key, { removeDays: [day(10)] })]);
    assert.equal(add.status, 200);
    assert.equal(del.status, 200);
    const s = await state(ev.id);
    assert.deepEqual(s.days, [day(11), day(12)]);
    assert.deepEqual(s.votes[suggester].days, [day(12)]);
    assert.deepEqual(s.votes[voter].days, []);
  });

  it('4. cap race: with 19 days two suggestions add exactly one, the loser stores no vote', async () => {
    const ev = await event({ pollDays: range(10, 19) });
    const [a, b] = [await member(), await member()];
    const [ra, rb] = await Promise.all([suggest(ev.id, a, day(40)), suggest(ev.id, b, day(41))]);
    assert.deepEqual([ra.status, rb.status].sort(), [200, 409]);
    const [won, lost, lostDay] = ra.status === 200 ? [a, b, day(41)] : [b, a, day(40)];
    const loser = ra.status === 200 ? rb : ra;
    assert.equal(loser.message, 'tooManyDays');
    const s = await state(ev.id);
    assert.equal(s.days.length, 20);
    assert.ok(!s.days.includes(lostDay));
    assert.ok(s.votes[won].days.length === 1);
    assert.ok(!s.votes[lost] || !s.votes[lost].days.includes(lostDay));
  });

  it('5. stress: removals, voters and suggestions together keep I1–I3', async () => {
    for (let round = 0; round < 30; round++) {
      const ev = await event({ pollDays: range(10, 4) });
      const people = await Promise.all([1, 2, 3, 4, 5].map(() => member()));
      const calls = [
        patch(ev.id, ev.key, { removeDays: [day(10 + (round % 4))] }),
        suggest(ev.id, people[0], day(20 + (round % 3))),
        ...people.map((p, i) => vote(ev.id, p, { days: range(10, 4).filter((_, j) => (i + j + round) % 2 === 0) })),
      ];
      for (const res of await Promise.all(calls)) assert.ok([200, 409].includes(res.status), `round ${round}: ${res.status} ${res.message}`);
      await assertInvariants(ev.id);
    }
  });

  it('6. a place removal in flight blocks a vote for it, which then answers 409 venuesChanged', async () => {
    const ev = await event();
    const m = await member();
    const added = await api(`/api/events/${ev.id}/venues`, { method: 'POST', key: ev.key, body: { addedBy: m, name: 'zz-test-place' } });
    assert.equal(added.status, 201);
    const venueId = added.body.id as number;
    const tx = await transaction();
    try {
      await tx.query('SELECT 1 FROM events WHERE id = $1 FOR UPDATE', [ev.id]);
      await tx.query('DELETE FROM venues WHERE id = $1', [venueId]);
      const put = vote(ev.id, m, { venueIds: [venueId] });
      assert.ok(await stillPending(put), 'the vote should wait for the removal');
      await tx.commit();
      const res = await put;
      assert.equal(res.status, 409);
      assert.equal(res.message, 'venuesChanged');
    } finally {
      await tx.rollback().catch(() => {});
    }
    assert.deepEqual((await state(ev.id)).votes[m]?.venueIds ?? [], []);
    const [{ n }] = await query('SELECT count(*)::int AS n FROM venues WHERE event_id = $1', [ev.id]);
    assert.equal(n, 0);
  });
});
