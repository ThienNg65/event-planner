import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanup, day, event, member, query, startServer, stopServer } from './harness.ts';

/** Votes imply attendance: lock derives Going, queue order, reopen to the poll (plan Phases 1 and 4). */
before(startServer);
afterEach(cleanup);
after(stopServer);

const patch = (id: number, key: string | undefined, body: unknown) => api(`/api/events/${id}`, { method: 'PATCH', key, body });
const get = async (id: number) => (await api(`/api/events/${id}`)).body;
const vote = (id: number, memberId: number, days: string[]) => api(`/api/events/${id}/response`, { method: 'PUT', me: memberId, body: { memberId, days } });
const answer = (id: number, memberId: number, status: string | null, key?: string) =>
  api(`/api/events/${id}/response`, { method: 'PUT', me: memberId, key, body: { memberId, status } });
const rowOf = async (id: number, memberId: number) =>
  (await query(`SELECT status, derived, going_at, first_voted_at FROM responses WHERE event_id = $1 AND member_id = $2`, [id, memberId]))[0];
/** Noon in Vietnam on a poll day, so the locked day is that poll day. */
const lockAt = (n: number) => ({ stage: 'rsvp', startsAt: `${day(n)}T12:00:00+07:00` });

describe('lock derives attendance', () => {
  it('marks matching voters Going, leaves the rest, keeps explicit answers', async () => {
    const ev = await event();
    const [a, b, c, d] = [await member(), await member(), await member(), await member()];
    await vote(ev.id, a, [day(10)]);
    await vote(ev.id, b, [day(10), day(11)]);
    await vote(ev.id, c, [day(11)]);
    await vote(ev.id, d, [day(10)]);
    await answer(ev.id, d, 'maybe', ev.key);
    assert.equal((await patch(ev.id, ev.key, lockAt(10))).status, 200);
    for (const m of [a, b]) assert.deepEqual([(await rowOf(ev.id, m))!.status, (await rowOf(ev.id, m))!.derived], ['going', 'going']);
    assert.equal((await rowOf(ev.id, c))!.status, null);
    assert.deepEqual([(await rowOf(ev.id, d))!.status, (await rowOf(ev.id, d))!.derived], ['maybe', null]);
  });

  it('queues by first vote, so the earlier voter gets the only seat', async () => {
    const ev = await event({ capacity: 1 });
    const [a, b] = [await member(), await member()];
    await vote(ev.id, b, [day(10)]);
    await vote(ev.id, a, [day(10)]);
    await patch(ev.id, ev.key, lockAt(10));
    const data = await get(ev.id);
    assert.deepEqual(data.confirmed, [b]);
    assert.deepEqual(data.waitlist, [a]);
  });

  it('first_voted_at is set once: editing the votes does not move it', async () => {
    const ev = await event();
    const a = await member();
    await vote(ev.id, a, [day(10)]);
    const first = (await rowOf(ev.id, a))!.first_voted_at;
    assert.ok(first);
    await new Promise((r) => setTimeout(r, 30));
    await vote(ev.id, a, []);
    await vote(ev.id, a, [day(11)]);
    assert.deepEqual((await rowOf(ev.id, a))!.first_voted_at, first);
  });

  it('two locks at once: nobody is marked twice', async () => {
    const ev = await event();
    const a = await member();
    await vote(ev.id, a, [day(10)]);
    const res = await Promise.all([patch(ev.id, ev.key, lockAt(10)), patch(ev.id, ev.key, lockAt(10))]);
    assert.ok(res.every((r) => [200, 409].includes(r.status)));
    assert.equal((await rowOf(ev.id, a))!.derived, 'going');
  });

  it('a derived member who adds a guest goes to the back of the queue', async () => {
    const ev = await event({ capacity: 3 });
    const [a, b] = [await member(), await member()];
    await vote(ev.id, a, [day(10)]);
    await vote(ev.id, b, [day(10)]);
    await patch(ev.id, ev.key, lockAt(10));
    const before = (await rowOf(ev.id, a))!.going_at as Date;
    await new Promise((r) => setTimeout(r, 30));
    await api(`/api/events/${ev.id}/response`, { method: 'PUT', me: a, body: { memberId: a, status: 'going', guests: 1 } });
    const after = await rowOf(ev.id, a);
    assert.ok((after!.going_at as Date) > before);
    assert.equal(after!.derived, null);
  });
});

describe('reopen to the poll', () => {
  it('clears unpaid derived answers, keeps explicit answers and votes', async () => {
    const ev = await event();
    const [a, b] = [await member(), await member()];
    await vote(ev.id, a, [day(10)]);
    await vote(ev.id, b, [day(10)]);
    await patch(ev.id, ev.key, lockAt(10));
    await answer(ev.id, b, 'going');
    const res = await patch(ev.id, ev.key, { stage: 'poll', reopenVoting: true, voteDeadline: null });
    assert.equal(res.status, 200);
    assert.deepEqual([(await rowOf(ev.id, a))!.status, (await rowOf(ev.id, a))!.derived], [null, null]);
    assert.equal((await rowOf(ev.id, b))!.status, 'going');
    const mine = (await get(ev.id)).responses.find((r: { memberId: number }) => r.memberId === a);
    assert.deepEqual(mine.days, [day(10)]);
  });

  it('with payments the host must acknowledge them, and the payment is never touched', async () => {
    const ev = await event();
    const a = await member();
    await vote(ev.id, a, [day(10)]);
    await patch(ev.id, ev.key, lockAt(10));
    await patch(ev.id, ev.key, { stage: 'bill', billTotal: 100_000 });
    await api(`/api/events/${ev.id}/response`, { method: 'PUT', me: a, body: { memberId: a, addPaid: 50_000 } });
    const refused = await patch(ev.id, ev.key, { stage: 'poll', reopenVoting: true, voteDeadline: null });
    assert.equal(refused.status, 409);
    assert.equal(refused.message, 'hasPayments');
    assert.equal((await patch(ev.id, ev.key, { stage: 'poll', reopenVoting: true, voteDeadline: null, acknowledgePayments: true })).status, 200);
    const [row] = await query(`SELECT paid_amount FROM responses WHERE event_id = $1 AND member_id = $2`, [ev.id, a]);
    assert.equal(row!.paid_amount, 50_000);
  });
});
