import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanup, day, event, member, startServer, stopServer } from './harness.ts';

/** Private events: reachable only through the joining link; the overview lists only my events. */
before(startServer);
afterEach(cleanup);
after(stopServer);

const base = (id: number) => `/api/events/${id}`;
const ids = (list: { id: number }[]) => list.map((e) => e.id);

describe('private events', () => {
  /** The creator's list has the event, another member's does not, and signed out is empty. */
  it('lists only my events', async () => {
    const ev = await event();
    const other = await member();
    assert.ok(ids((await api('/api/events', { me: ev.createdBy })).body).includes(ev.id));
    assert.ok(!ids((await api('/api/events', { me: other })).body).includes(ev.id));
    assert.deepEqual((await api('/api/events')).body, []);
  });

  /** Without the link a stranger gets notFound; the creator and a manage-key holder get in. */
  it('hides the event from people without the link', async () => {
    const ev = await event();
    const stranger = await member();
    const res = await api(base(ev.id), { me: stranger, join: false });
    assert.equal(res.status, 404);
    assert.equal(res.message, 'notFound');
    assert.equal((await api(base(ev.id), { me: ev.createdBy, join: false })).status, 200);
    assert.equal((await api(base(ev.id), { key: ev.key, join: false })).status, 200);
  });

  /** Opening the link signed in joins once; later visits need no key. */
  it('joins a signed-in visitor who opens the link', async () => {
    const ev = await event();
    const guest = await member();
    const first = await api(base(ev.id), { me: guest });
    assert.equal(first.status, 200);
    assert.equal(first.body.joinedNow, true);
    assert.ok(first.body.participants.some((p: { id: number }) => p.id === guest));
    assert.ok(ids((await api('/api/events', { me: guest })).body).includes(ev.id));
    const again = await api(base(ev.id), { me: guest, join: false });
    assert.equal(again.status, 200);
    assert.equal(again.body.joinedNow, false);
  });

  /** A signed-out visitor with the key sees the event but does not become a participant. */
  it('does not join a signed-out visitor', async () => {
    const ev = await event();
    const before = (await api(base(ev.id), { me: ev.createdBy })).body.participants.length;
    const res = await api(base(ev.id));
    assert.equal(res.status, 200);
    assert.equal(res.body.participants.length, before);
  });

  /** A non-participant without the key cannot answer. */
  it('refuses an answer from a non-participant', async () => {
    const ev = await event();
    const stranger = await member();
    const res = await api(`${base(ev.id)}/response`, { method: 'PUT', me: stranger, join: false, body: { memberId: stranger, days: [day(10)] } });
    assert.equal(res.status, 404);
  });

  /** The creator is a participant from the start. */
  it('puts the creator in participants on create', async () => {
    const ev = await event();
    const res = await api(base(ev.id), { me: ev.createdBy, join: false });
    assert.ok(res.body.participants.some((p: { id: number }) => p.id === ev.createdBy));
  });

  /** An accepted co-host becomes a participant and sees the event on their home list. */
  it('makes an accepting co-host a participant', async () => {
    const ev = await event();
    const co = await member();
    const invite = (await api(`${base(ev.id)}/cohosts`, { method: 'POST', key: ev.key, body: { memberId: co } })).body.invite;
    assert.equal((await api(`${base(ev.id)}/cohosts/accept`, { method: 'POST', me: co, body: { invite } })).status, 200);
    const res = await api(base(ev.id), { me: co, join: false });
    assert.ok(res.body.participants.some((p: { id: number }) => p.id === co));
    assert.ok(ids((await api('/api/events', { me: co })).body).includes(ev.id));
  });

  /** Days, places and role-gated writes answer notFound to a stranger, so ids can't be probed. */
  it('answers notFound to strangers on every write', async () => {
    const ev = await event();
    const stranger = await member();
    const calls: [string, string, object?][] = [
      ['POST', '/days', { memberId: stranger, day: day(12) }],
      ['POST', '/venues', { addedBy: stranger, name: 'zz-test-venue' }],
      ['PATCH', '', {}],
      ['DELETE', ''],
      ['POST', '/cohost'],
      ['DELETE', '/venues/1'],
    ];
    for (const [method, path, body] of calls) {
      const res = await api(`${base(ev.id)}${path}`, { method, me: stranger, join: false, body });
      assert.equal(res.status, 404, `${method} ${path}`);
    }
  });

  /** A repeated j parameter is just a wrong key, not a server error. */
  it('treats a repeated card key as wrong', async () => {
    const ev = await event();
    const res = await fetch(`http://localhost:3999${base(ev.id)}/card?j=a&j=b`, { redirect: 'manual' });
    assert.equal(res.status, 302);
  });

  /** The card redirects to the fallback icon without the key, and renders with it. */
  it('guards the share card with the key', async () => {
    const ev = await event();
    const key = (await api(base(ev.id), { me: ev.createdBy })).body.event.joinKey;
    const bare = await fetch(`http://localhost:3999${base(ev.id)}/card`, { redirect: 'manual' });
    assert.equal(bare.status, 302);
    assert.equal(bare.headers.get('location'), '/icon-512.png');
    const withKey = await fetch(`http://localhost:3999${base(ev.id)}/card?j=${key}`);
    assert.equal(withKey.status, 200);
    assert.equal(withKey.headers.get('content-type'), 'image/png');
  });
});
