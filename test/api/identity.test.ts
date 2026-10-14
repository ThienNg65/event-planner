import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PIN, api, cleanup, event, member, query, startServer, stopServer } from './harness.ts';

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
    await query('UPDATE members SET token_hash = NULL, pin_hash = NULL WHERE id = $1', [id]);
    const first = await api(`/api/members/${id}/claim`, { method: 'POST', body: { pin: PIN } });
    assert.equal(first.status, 200);
    assert.match(first.headers.get('set-cookie') ?? '', /sid=.+HttpOnly/i);
    const second = await api(`/api/members/${id}/claim`, { method: 'POST', body: { pin: PIN } });
    assert.equal(second.status, 409);
    assert.equal(second.message, 'nameClaimed');
  });

  it('a name that organizes an event is not claimable, so nobody inherits its host rights', async () => {
    const ev = await event();
    await query('UPDATE members SET token_hash = NULL, pin_hash = NULL WHERE id = $1', [ev.createdBy]);
    const res = await api(`/api/members/${ev.createdBy}/claim`, { method: 'POST', body: { pin: PIN } });
    assert.equal(res.status, 409);
    assert.equal(res.message, 'nameOrganizer');
    const list = (await api('/api/members')).body as { id: number; claimed: boolean }[];
    assert.equal(list.find((m) => m.id === ev.createdBy)?.claimed, true);
  });

  it('a member invited to co-host can still claim their name, so they can accept', async () => {
    const ev = await event();
    const co = await member();
    await api(`/api/events/${ev.id}/cohosts`, { method: 'POST', key: ev.key, body: { memberId: co } });
    await query('UPDATE members SET token_hash = NULL, pin_hash = NULL WHERE id = $1', [co]);
    assert.equal((await api(`/api/members/${co}/claim`, { method: 'POST', body: { pin: PIN } })).status, 200);
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

describe('signing in with a PIN', () => {
  it('a new browser gets in with the right PIN and is its own session', async () => {
    const id = await member();
    const res = await api(`/api/members/${id}/signin`, { method: 'POST', body: { pin: PIN } });
    assert.equal(res.status, 200);
    assert.equal(res.body.id, id);
    const sid = /sid=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
    assert.equal((await api('/api/me', { sid })).body.id, id);
    // The first browser's session still works.
    assert.equal((await api('/api/me', { me: id })).body.id, id);
  });

  it('a wrong PIN, an unknown name and a name without a PIN all answer the same', async () => {
    const id = await member();
    const none = await member();
    await query('UPDATE members SET pin_hash = NULL WHERE id = $1', [none]);
    assert.equal((await api(`/api/members/${id}/signin`, { method: 'POST', body: { pin: '135790' } })).message, 'pinWrong');
    assert.equal((await api(`/api/members/${none}/signin`, { method: 'POST', body: { pin: PIN } })).message, 'pinWrong');
    assert.equal((await api('/api/members/999999999/signin', { method: 'POST', body: { pin: PIN } })).message, 'pinWrong');
  });

  it('locks the name after five wrong PINs, even for the right one', async () => {
    const id = await member();
    for (let i = 0; i < 5; i++) assert.equal((await api(`/api/members/${id}/signin`, { method: 'POST', body: { pin: '135790' } })).message, 'pinWrong');
    const locked = await api(`/api/members/${id}/signin`, { method: 'POST', body: { pin: PIN } });
    assert.equal(locked.status, 429);
    assert.equal(locked.message, 'pinLocked');
    await query('UPDATE members SET pin_locked_until = now() - interval \'1 second\' WHERE id = $1', [id]);
    assert.equal((await api(`/api/members/${id}/signin`, { method: 'POST', body: { pin: PIN } })).status, 200);
  });

  it('parallel guesses still stop at the limit', async () => {
    const id = await member();
    const results = await Promise.all(Array.from({ length: 12 }, () => api(`/api/members/${id}/signin`, { method: 'POST', body: { pin: '135790' } })));
    assert.equal(results.filter((r) => r.message === 'pinWrong').length, 5);
    assert.equal(results.filter((r) => r.message === 'pinLocked').length, 7);
  });

  it('refuses a weak or malformed PIN when one is set', async () => {
    assert.equal((await api('/api/members', { method: 'POST', body: { name: 'zz-test-weak', pin: '123456' } })).message, 'pinWeak');
    assert.equal((await api('/api/members', { method: 'POST', body: { name: 'zz-test-short', pin: '12' } })).message, 'pinFormat');
  });

  it('a signed-in member can change their PIN; the old one stops working', async () => {
    const id = await member();
    assert.equal((await api('/api/me/pin', { method: 'POST', me: id, body: { pin: '135790' } })).status, 200);
    assert.equal((await api(`/api/members/${id}/signin`, { method: 'POST', body: { pin: PIN } })).message, 'pinWrong');
    assert.equal((await api(`/api/members/${id}/signin`, { method: 'POST', body: { pin: '135790' } })).status, 200);
    assert.equal((await api('/api/me/pin', { method: 'POST', body: { pin: '135790' } })).status, 401);
  });
});

describe('resetting a PIN', () => {
  it('an organizer gives a member a new PIN and signs them out everywhere', async () => {
    const org = await event();
    const id = await member();
    const old = (await api('/api/me/link', { method: 'POST', me: id })).body.token as string;
    const { body } = await api(`/api/members/${id}/pin-reset`, { method: 'POST', me: org.createdBy });
    assert.match(body.pin, /^\d{6}$/);
    assert.equal((await api('/api/me/signin', { method: 'POST', body: { token: old } })).message, 'signInInvalid');
    assert.equal((await api(`/api/members/${id}/signin`, { method: 'POST', body: { pin: PIN } })).message, 'pinWrong');
    assert.equal((await api(`/api/members/${id}/signin`, { method: 'POST', body: { pin: body.pin } })).status, 200);
  });

  it('only organizers may reset, and never another organizer', async () => {
    const org = await event();
    const other = await event();
    const plain = await member();
    assert.equal((await api(`/api/members/${plain}/pin-reset`, { method: 'POST', me: await member() })).message, 'organizersOnly');
    assert.equal((await api(`/api/members/${plain}/pin-reset`, { method: 'POST' })).message, 'signInFirst');
    assert.equal((await api(`/api/members/${other.createdBy}/pin-reset`, { method: 'POST', me: org.createdBy })).message, 'pinResetOrganizer');
  });
});

describe('signing out other devices', () => {
  it('kills the old sign-in link and other sessions, and keeps this browser in', async () => {
    const id = await member();
    const link = (await api('/api/me/link', { method: 'POST', me: id })).body.token as string;
    const other = await api(`/api/members/${id}/signin`, { method: 'POST', body: { pin: PIN } });
    const otherSid = /sid=([^;]+)/.exec(other.headers.get('set-cookie') ?? '')![1]!;
    assert.equal((await api('/api/me', { sid: otherSid })).body.id, id);
    const res = await api('/api/me/signout-others', { method: 'POST', me: id });
    assert.equal(res.status, 200);
    const fresh = /sid=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')![1]!;
    assert.notEqual(fresh, link);
    assert.equal((await api('/api/me/signin', { method: 'POST', body: { token: link } })).message, 'signInInvalid');
    assert.equal((await api('/api/me', { sid: otherSid })).body, null);
    assert.equal((await api('/api/me', { sid: fresh })).body.id, id);
  });

  it('needs a session', async () => {
    assert.equal((await api('/api/me/signout-others', { method: 'POST' })).message, 'signInFirst');
  });
});
