import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanup, event, member, query, startServer, stopServer } from './harness.ts';

/** Signed-in identity: the session cookie, claiming a name once, and organizer rights without a manage key. */
before(startServer);
afterEach(cleanup);
after(stopServer);

describe('organizer rights by identity', () => {
  it('the creator is the host without the manage key, others are participants', async () => {
    const ev = await event();
    assert.equal((await api(`/api/events/${ev.id}`, { me: ev.createdBy })).body.role, 'host');
    assert.equal((await api(`/api/events/${ev.id}`, { me: await member() })).body.role, null);
    assert.equal((await api(`/api/events/${ev.id}`)).body.role, null);
  });

  it('an accepted co-host is a co-host without their access key', async () => {
    const ev = await event();
    const co = await member();
    const { body } = await api(`/api/events/${ev.id}/cohosts`, { method: 'POST', key: ev.key, body: { memberId: co } });
    assert.equal((await api(`/api/events/${ev.id}`, { me: co })).body.role, null);
    await api(`/api/events/${ev.id}/cohosts/accept`, { method: 'POST', me: co, body: { invite: body.invite } });
    assert.equal((await api(`/api/events/${ev.id}`, { me: co })).body.role, 'cohost');
  });

  it('home marks the events the member organizes', async () => {
    const ev = await event();
    const list = (await api('/api/events', { me: ev.createdBy })).body as { id: number; manager: boolean }[];
    assert.equal(list.find((e) => e.id === ev.id)?.manager, true);
  });

  it('creating an event needs a signed-in member, who becomes the creator', async () => {
    const res = await api('/api/events', { method: 'POST', body: { title: 'zz-test-anon', pollDays: ['2099-01-01'] } });
    assert.equal(res.status, 401);
    assert.equal(res.message, 'signInFirst');
  });
});

describe('claiming a name', () => {
  it('works once; the second claim is refused', async () => {
    const id = await member();
    await query('UPDATE members SET token_hash = NULL WHERE id = $1', [id]);
    const first = await api(`/api/members/${id}/claim`, { method: 'POST' });
    assert.equal(first.status, 200);
    assert.match(first.headers.get('set-cookie') ?? '', /sid=.+HttpOnly/i);
    const second = await api(`/api/members/${id}/claim`, { method: 'POST' });
    assert.equal(second.status, 409);
    assert.equal(second.message, 'nameClaimed');
  });

  it('a name that organizes an event is not claimable, so nobody inherits its host rights', async () => {
    const ev = await event();
    await query('UPDATE members SET token_hash = NULL WHERE id = $1', [ev.createdBy]);
    const res = await api(`/api/members/${ev.createdBy}/claim`, { method: 'POST' });
    assert.equal(res.status, 409);
    assert.equal(res.message, 'nameOrganizer');
    const list = (await api('/api/members')).body as { id: number; claimed: boolean }[];
    assert.equal(list.find((m) => m.id === ev.createdBy)?.claimed, true);
  });

  it('a member invited to co-host can still claim their name, so they can accept', async () => {
    const ev = await event();
    const co = await member();
    await api(`/api/events/${ev.id}/cohosts`, { method: 'POST', key: ev.key, body: { memberId: co } });
    await query('UPDATE members SET token_hash = NULL WHERE id = $1', [co]);
    assert.equal((await api(`/api/members/${co}/claim`, { method: 'POST' })).status, 200);
  });

  it('a sign-in link signs another browser in as the same member', async () => {
    const id = await member();
    const { token } = (await api('/api/me/link', { method: 'POST', me: id })).body;
    const res = await api('/api/me/signin', { method: 'POST', body: { token } });
    assert.equal(res.body.id, id);
    assert.equal((await api('/api/me/signin', { method: 'POST', body: { token: 'nope' } })).message, 'signInInvalid');
  });

  it('signing out clears the cookie but keeps the sign-in link working', async () => {
    const id = await member();
    const { token } = (await api('/api/me/link', { method: 'POST', me: id })).body;
    const out = await api('/api/me/signout', { method: 'POST', me: id });
    assert.match(out.headers.get('set-cookie') ?? '', /sid=;.*Max-Age=0/i);
    assert.equal((await api('/api/me/signin', { method: 'POST', body: { token } })).body.id, id);
  });
});
