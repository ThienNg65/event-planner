import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanup, day, event, member, query, startServer, stopServer } from './harness.ts';

/** Phase 2 R2: Yes / If need be / No votes on days and places. */
before(startServer);
afterEach(cleanup);
after(stopServer);

const put = (id: number, memberId: number, body: object) => api(`/api/events/${id}/response`, { method: 'PUT', me: memberId, body: { memberId, ...body } });
const patch = (id: number, key: string, body: unknown) => api(`/api/events/${id}`, { method: 'PATCH', key, body });
const rowOf = async (id: number, memberId: number) =>
  (await query(`SELECT status, derived, days::text[] AS days, maybe_days::text[] AS maybe_days, venue_ids, maybe_venue_ids FROM responses WHERE event_id = $1 AND member_id = $2`, [id, memberId]))[0]!;
const lockAt = (n: number) => ({ stage: 'rsvp', startsAt: `${day(n)}T12:00:00+07:00` });

describe('if need be votes', () => {
  it('keeps yes and if-need-be apart, and the lock seats only the yes voter', async () => {
    const ev = await event();
    const [a, b] = [await member(), await member()];
    assert.equal((await put(ev.id, a, { days: [day(10)], maybeDays: [day(10), day(11)] })).status, 200);
    assert.equal((await put(ev.id, b, { maybeDays: [day(10)] })).status, 200);
    assert.deepEqual([(await rowOf(ev.id, a)).days, (await rowOf(ev.id, a)).maybe_days], [[day(10)], [day(11)]]);
    assert.equal((await patch(ev.id, ev.key, lockAt(10))).status, 200);
    assert.deepEqual([(await rowOf(ev.id, a)).status, (await rowOf(ev.id, b)).status], ['going', null]);
  });

  it('drops a removed day from both lists, and a removed place too', async () => {
    const ev = await event();
    const a = await member();
    const venue = await api(`/api/events/${ev.id}/venues`, { method: 'POST', me: a, body: { addedBy: a, name: 'zz-test-venue' } });
    assert.equal(venue.status, 201);
    const venueId = venue.body.id as number;
    await put(ev.id, a, { days: [day(10)], maybeDays: [day(11)], maybeVenueIds: [venueId] });
    assert.equal((await patch(ev.id, ev.key, { removeDays: [day(11)] })).status, 200);
    assert.deepEqual((await rowOf(ev.id, a)).maybe_days, []);
    assert.equal((await api(`/api/events/${ev.id}/venues/${venueId}`, { method: 'DELETE', key: ev.key })).status, 200);
    assert.deepEqual((await rowOf(ev.id, a)).maybe_venue_ids, []);
  });

  it('hides if-need-be picks along with the rest when results are hidden', async () => {
    const ev = await event({ hideVotes: true });
    const [a, b] = [await member(), await member()];
    await put(ev.id, a, { maybeDays: [day(10)] });
    const seen = (await api(`/api/events/${ev.id}`, { me: b })).body;
    assert.equal(seen.votesHidden, true);
    const row = seen.responses.find((r: { memberId: number }) => r.memberId === a);
    assert.deepEqual([row.maybeDays, row.voted], [[], true]);
  });
});
