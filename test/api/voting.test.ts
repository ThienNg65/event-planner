import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanup, cohostKey, day, event, member, startServer, stopServer } from './harness.ts';

/** Closing and reopening voting, reopening to the poll, and the one-step stage rule (plan Phase 3). */
before(startServer);
afterEach(cleanup);
after(stopServer);

const patch = (id: number, key: string | undefined, body: unknown) => api(`/api/events/${id}`, { method: 'PATCH', key, body });
const get = async (id: number) => (await api(`/api/events/${id}`)).body;
const vote = (id: number, memberId: number, days: string[], key?: string) =>
  api(`/api/events/${id}/response`, { method: 'PUT', me: memberId, key, body: { memberId, days } });
const future = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
const lock = { stage: 'rsvp', startsAt: future(60 * 24 * 12) };

describe('close voting', () => {
  it('is idempotent: a second close keeps the first close time', async () => {
    const ev = await event();
    assert.equal((await patch(ev.id, ev.key, { closeVoting: true })).status, 200);
    const first = (await get(ev.id)).event.voteDeadline;
    assert.ok(first && new Date(first).getTime() <= Date.now());
    await new Promise((r) => setTimeout(r, 30));
    assert.equal((await patch(ev.id, ev.key, { closeVoting: true })).status, 200);
    assert.equal((await get(ev.id)).event.voteDeadline, first);
  });

  it('refuses outside the poll stage and while cancelled', async () => {
    const ev = await event();
    assert.equal((await patch(ev.id, ev.key, lock)).status, 200);
    const late = await patch(ev.id, ev.key, { closeVoting: true });
    assert.equal(late.status, 409);
    assert.equal(late.message, 'stageClosed');

    const other = await event();
    await patch(other.id, other.key, { cancel: '' });
    const cancelled = await patch(other.id, other.key, { closeVoting: true });
    assert.equal(cancelled.status, 409);
    assert.equal(cancelled.message, 'cancelled');
  });

  it('is for organizers: a participant gets 403, a co-host 200', async () => {
    const ev = await event();
    assert.equal((await patch(ev.id, undefined, { closeVoting: true })).status, 403);
    const co = await cohostKey(ev.id, ev.key);
    assert.equal((await patch(ev.id, co, { closeVoting: true })).status, 200);
  });

  it('stops participants but not organizers from voting', async () => {
    const ev = await event();
    const [a, b] = [await member(), await member()];
    await patch(ev.id, ev.key, { closeVoting: true });
    const res = await vote(ev.id, a, [day(10)]);
    assert.equal(res.status, 409);
    assert.equal(res.message, 'votingClosed');
    assert.equal((await vote(ev.id, b, [day(10)], ev.key)).status, 200);
  });

  it('a deadline edit on a closed poll is refused, not a silent reopen', async () => {
    const ev = await event();
    await patch(ev.id, ev.key, { closeVoting: true });
    for (const voteDeadline of [future(60), null]) {
      const res = await patch(ev.id, ev.key, { voteDeadline });
      assert.equal(res.status, 409);
      assert.equal(res.message, 'votingClosed');
    }
  });
});

describe('reopen voting', () => {
  it('needs a future deadline or null', async () => {
    const ev = await event();
    await patch(ev.id, ev.key, { closeVoting: true });
    const past = await patch(ev.id, ev.key, { reopenVoting: true, voteDeadline: new Date(Date.now() - 60_000).toISOString() });
    assert.equal(past.status, 400);
    assert.equal(past.message, 'invalidDate');
    assert.equal((await patch(ev.id, ev.key, { reopenVoting: true })).status, 400);
  });

  it('with null removes the deadline and lets participants vote again', async () => {
    const ev = await event();
    const a = await member();
    await patch(ev.id, ev.key, { closeVoting: true });
    assert.equal((await patch(ev.id, ev.key, { reopenVoting: true, voteDeadline: null })).status, 200);
    assert.equal((await get(ev.id)).event.voteDeadline, null);
    assert.equal((await vote(ev.id, a, [day(10)])).status, 200);
  });

  it('is organizers only, and only in the poll stage', async () => {
    const ev = await event();
    assert.equal((await patch(ev.id, undefined, { reopenVoting: true, voteDeadline: null })).status, 403);
    await patch(ev.id, ev.key, lock);
    assert.equal((await patch(ev.id, ev.key, { reopenVoting: true, voteDeadline: null })).status, 400);
  });

  it('keeps every vote through close, reopen, lock and a host reopen to the poll', async () => {
    const ev = await event();
    const [a, b] = [await member(), await member()];
    await vote(ev.id, a, [day(10), day(11)]);
    const before = (await get(ev.id)).responses;

    await patch(ev.id, ev.key, { closeVoting: true });
    await patch(ev.id, ev.key, { reopenVoting: true, voteDeadline: null });
    assert.equal((await vote(ev.id, b, [day(11)])).status, 200);
    await patch(ev.id, ev.key, { closeVoting: true });
    assert.equal((await patch(ev.id, ev.key, lock)).status, 200);
    const back = await patch(ev.id, ev.key, { stage: 'poll', reopenVoting: true, voteDeadline: future(120) });
    assert.equal(back.status, 200);

    const after = (await get(ev.id)).responses;
    assert.deepEqual(after.find((r: { memberId: number }) => r.memberId === a), before.find((r: { memberId: number }) => r.memberId === a));
    assert.deepEqual(after.find((r: { memberId: number }) => r.memberId === b).days, [day(11)]);
  });

  it('reopening to the poll clears the locked date of a day poll, not of a place-only event', async () => {
    const days = await event();
    await patch(days.id, days.key, lock);
    await patch(days.id, days.key, { stage: 'poll', reopenVoting: true, voteDeadline: null });
    const reopened = await get(days.id);
    assert.equal(reopened.event.stage, 'poll');
    assert.equal(reopened.event.startsAt, null);

    const places = await event({ pollDays: [], startsAt: lock.startsAt });
    await patch(places.id, places.key, { stage: 'rsvp' });
    await patch(places.id, places.key, { stage: 'poll', reopenVoting: true, voteDeadline: null });
    assert.notEqual((await get(places.id)).event.startsAt, null);
  });
});

describe('stage moves', () => {
  it('forward moves go one stage at a time', async () => {
    const ev = await event();
    const jump = await patch(ev.id, ev.key, { stage: 'bill', startsAt: future(60 * 24 * 12) });
    assert.equal(jump.status, 409);
    assert.equal(jump.message, 'stageClosed');
    assert.equal((await get(ev.id)).event.stage, 'poll');
    assert.equal((await patch(ev.id, ev.key, lock)).status, 200);
    assert.equal((await patch(ev.id, ev.key, { stage: 'bill' })).status, 200);
  });
});
