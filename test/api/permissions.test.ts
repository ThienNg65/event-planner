import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanup, cohostKey, day, event, member, startServer, stopServer } from './harness.ts';

/** Pins the roles and voting rules as they are today (plan Slice 0). */
before(startServer);
afterEach(cleanup);
after(stopServer);

const venueBody = (addedBy: number) => ({ addedBy, name: 'zz-test-venue' });

describe('participants', () => {
  it('cannot write another member\'s response', async () => {
    const ev = await event();
    const [a, b] = [await member(), await member()];
    const res = await api(`/api/events/${ev.id}/response`, { method: 'PUT', me: a, body: { memberId: b, days: [day(10)] } });
    assert.equal(res.status, 403);
    assert.equal(res.message, 'notYou');
    const own = await api(`/api/events/${ev.id}/response`, { method: 'PUT', me: a, body: { memberId: a, days: [day(10)] } });
    assert.equal(own.status, 200);
  });

  it('are refused after the deadline, organizers are not', async () => {
    const ev = await event({ voteDeadline: new Date(Date.now() - 60_000).toISOString() });
    const [a, b] = [await member(), await member()];
    const late = await api(`/api/events/${ev.id}/response`, { method: 'PUT', me: a, body: { memberId: a, days: [day(10)] } });
    assert.equal(late.status, 409);
    assert.equal(late.message, 'votingClosed');
    const organizer = await api(`/api/events/${ev.id}/response`, { method: 'PUT', key: ev.key, body: { memberId: b, days: [day(10)] } });
    assert.equal(organizer.status, 200);
  });
});

describe('privileged endpoints', () => {
  // [label, method, path (event id filled in), body]; the venue delete id is a placeholder, the role check runs first.
  const calls: [string, string, string, unknown?][] = [
    ['PATCH event', 'PATCH', '', { note: 'x' }],
    ['DELETE event', 'DELETE', ''],
    ['POST cohost', 'POST', '/cohost'],
    ['DELETE cohost', 'DELETE', '/cohost'],
    ['DELETE venue', 'DELETE', '/venues/1'],
  ];

  for (const [label, method, path, body] of calls) {
    it(`${label} without a key → 403`, async () => {
      const ev = await event();
      const res = await api(`/api/events/${ev.id}${path}`, { method, body });
      assert.equal(res.status, 403);
      assert.equal(res.message, 'forbidden');
    });
  }

  it('a co-host cannot reopen, cancel, delete or manage the co-host link', async () => {
    // A fixed date and place put the event straight into RSVP, so there is a stage to reopen.
    const ev = await event({ pollDays: [], startsAt: new Date(Date.now() + 10 * 86_400_000).toISOString(), venue: 'zz-test-venue' });
    const key = await cohostKey(ev.id, ev.key);
    const base = `/api/events/${ev.id}`;
    const denied = [
      await api(base, { method: 'PATCH', key, body: { stage: 'poll' } }),
      await api(base, { method: 'PATCH', key, body: { cancel: 'zz-test' } }),
      await api(base, { method: 'DELETE', key }),
      await api(`${base}/cohost`, { method: 'POST', key }),
      await api(`${base}/cohost`, { method: 'DELETE', key }),
    ];
    for (const res of denied) {
      assert.equal(res.status, 403);
      assert.equal(res.message, 'hostOnly');
    }
    const edit = await api(base, { method: 'PATCH', key, body: { note: 'zz-test' } });
    assert.equal(edit.status, 200);
  });
});

describe('venues', () => {
  it('deleting a venue removes its votes', async () => {
    const ev = await event();
    const voter = await member();
    const venue = (await api(`/api/events/${ev.id}/venues`, { method: 'POST', me: voter, body: venueBody(voter) })).body;
    const vote = await api(`/api/events/${ev.id}/response`, { method: 'PUT', me: voter, body: { memberId: voter, venueIds: [venue.id] } });
    assert.equal(vote.status, 200);

    const del = await api(`/api/events/${ev.id}/venues/${venue.id}`, { method: 'DELETE', key: ev.key });
    assert.equal(del.status, 200);
    const { body } = await api(`/api/events/${ev.id}`);
    assert.deepEqual(body.venues, []);
    assert.deepEqual(body.responses.find((r: { memberId: number }) => r.memberId === voter).venueIds, []);
  });
});

describe('honorees', () => {
  it('organizers set and clear them; bad ids and participants are refused', async () => {
    const ev = await event();
    const base = `/api/events/${ev.id}`;
    const hon = await member();
    assert.equal((await api(base, { method: 'PATCH', key: ev.key, body: { honorees: [hon, hon] } })).status, 200);
    assert.deepEqual((await api(base)).body.event.honorees, [hon]);
    assert.equal((await api(base, { method: 'PATCH', key: ev.key, body: { honorees: ['x'] } })).status, 400);
    assert.equal((await api(base, { method: 'PATCH', key: ev.key, body: { honorees: [2 ** 31 - 1] } })).message, 'unknownMember');
    assert.equal((await api(base, { method: 'PATCH', me: hon, body: { honorees: [] } })).status, 403);
    assert.equal((await api(base, { method: 'PATCH', key: ev.key, body: { honorees: null } })).status, 200);
    assert.deepEqual((await api(base)).body.event.honorees, []);
  });
});
