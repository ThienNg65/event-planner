import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanup, day, event, member, startServer, stopServer } from './harness.ts';

/** Phase 2 R1: the per-event guest limit and hiding results until you vote. */
before(startServer);
afterEach(cleanup);
after(stopServer);

const put = (id: number, memberId: number, body: object, key?: string) =>
  api(`/api/events/${id}/response`, { method: 'PUT', me: memberId, key, body: { memberId, ...body } });
const get = async (id: number, me?: number) => (await api(`/api/events/${id}`, { me })).body;
const rsvpEvent = (extra: Record<string, unknown>) => event({ pollDays: [], startsAt: new Date(Date.now() + 10 * 86_400_000).toISOString(), venue: 'zz-test-place', ...extra });

describe('guest limit', () => {
  it('refuses more guests than the limit, allows up to it, and lets organizers set any number', async () => {
    const ev = await rsvpEvent({ maxGuests: 2 });
    const m = await member();
    const over = await put(ev.id, m, { status: 'going', guests: 3 });
    assert.equal(over.status, 400);
    assert.equal(over.message, 'tooManyGuests');
    assert.equal((await put(ev.id, m, { status: 'going', guests: 2 })).status, 200);
    assert.equal((await put(ev.id, m, { status: 'going', guests: 5 }, ev.key)).status, 200);
  });

  it('defaults to 10 and validates the field on create and update', async () => {
    const ev = await rsvpEvent({});
    const m = await member();
    assert.equal((await put(ev.id, m, { status: 'going', guests: 10 })).status, 200);
    const bad = await api(`/api/events/${ev.id}`, { method: 'PATCH', key: ev.key, body: { maxGuests: 11 } });
    assert.equal(bad.status, 400);
    assert.equal(bad.message, 'invalidGuests');
    assert.equal((await api(`/api/events/${ev.id}`, { method: 'PATCH', key: ev.key, body: { maxGuests: 0 } })).status, 200);
    assert.equal((await put(ev.id, m, { status: 'going', guests: 1 })).message, 'tooManyGuests');
  });
});

describe('hide votes', () => {
  it('hides other people\'s votes from someone who has not voted, until they do', async () => {
    const ev = await event({ hideVotes: true });
    const [a, b] = [await member(), await member()];
    assert.equal((await put(ev.id, a, { days: [day(10)] })).status, 200);

    const before = await get(ev.id, b);
    assert.equal(before.votesHidden, true);
    assert.deepEqual(before.responses.find((r: { memberId: number }) => r.memberId === a).days, []);
    assert.equal(before.responses.find((r: { memberId: number }) => r.memberId === a).voted, true);

    assert.equal((await put(ev.id, b, { days: [day(11)] })).status, 200);
    const after = await get(ev.id, b);
    assert.equal(after.votesHidden, false);
    assert.deepEqual(after.responses.find((r: { memberId: number }) => r.memberId === a).days, [day(10)]);
  });

  it('never hides from organizers, and only when the event asks for it', async () => {
    const hidden = await event({ hideVotes: true });
    const a = await member();
    await put(hidden.id, a, { days: [day(10)] });
    const host = (await api(`/api/events/${hidden.id}`, { key: hidden.key })).body;
    assert.equal(host.votesHidden, false);
    assert.deepEqual(host.responses.find((r: { memberId: number }) => r.memberId === a).days, [day(10)]);

    const open = await event({});
    const c = await member();
    await put(open.id, c, { days: [day(10)] });
    assert.equal((await get(open.id, await member())).votesHidden, false);
  });
});
