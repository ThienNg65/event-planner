import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanup, cohostKey, event, member, query, startServer, stopServer } from './harness.ts';

/** Named co-hosts: single-use invites, access keys, revocation and the permission matrix (plan Phase 4). */
before(startServer);
afterEach(cleanup);
after(stopServer);

const base = (id: number) => `/api/events/${id}`;
const invite = async (id: number, hostKey: string, memberId: number, extra: object = {}) => {
  const res = await api(`${base(id)}/cohosts`, { method: 'POST', key: hostKey, body: { memberId, ...extra } });
  assert.equal(res.status, 200, res.message);
  return res.body.invite as string;
};
const accept = (id: number, inviteSecret: string, me?: number) => api(`${base(id)}/cohosts/accept`, { method: 'POST', me, body: { invite: inviteSecret } });
/** An event with one active named co-host; returns the ids and the co-host's access key. */
async function withCohost() {
  const ev = await event();
  const co = await member();
  const secret = await invite(ev.id, ev.key, co);
  const res = await accept(ev.id, secret, co);
  assert.equal(res.status, 200);
  return { ev, co, secret, key: res.body.key as string };
}
const note = (id: number, key: string | undefined) => api(base(id), { method: 'PATCH', key, body: { note: 'x' } });

describe('invites', () => {
  it('a pending invite gives no role, and the invite secret is not an access key', async () => {
    const ev = await event();
    const co = await member();
    const secret = await invite(ev.id, ev.key, co);
    assert.equal((await note(ev.id, secret)).status, 403);
    assert.equal((await api(base(ev.id), { key: secret })).body.role, null);
  });

  it('accepting needs the invited member as `me`', async () => {
    const ev = await event();
    const [co, other] = [await member(), await member()];
    const secret = await invite(ev.id, ev.key, co);
    const wrong = await accept(ev.id, secret, other);
    assert.equal(wrong.status, 403);
    assert.equal(wrong.message, 'notYou');
    assert.equal((await accept(ev.id, secret)).status, 403);
    assert.equal((await accept(ev.id, secret, co)).status, 200);
  });

  it('accepting twice: the second loses, and the invite is dead afterwards', async () => {
    const { ev, co, secret, key } = await withCohost();
    const again = await accept(ev.id, secret, co);
    assert.equal(again.status, 404);
    assert.equal(again.message, 'inviteInvalid');
    const peek = await api(`${base(ev.id)}/cohosts/peek`, { method: 'POST', body: { invite: secret } });
    assert.equal(peek.status, 404);
    assert.equal((await note(ev.id, key)).status, 200);
  });

  it('an expired invite is refused with 410 and shown to the host as expired', async () => {
    const ev = await event();
    const co = await member();
    const secret = await invite(ev.id, ev.key, co);
    await query(`UPDATE cohosts SET invited_at = now() - interval '8 days' WHERE event_id = $1`, [ev.id]);
    const res = await accept(ev.id, secret, co);
    assert.equal(res.status, 410);
    assert.equal(res.message, 'inviteExpired');
    const peek = await api(`${base(ev.id)}/cohosts/peek`, { method: 'POST', body: { invite: secret } });
    assert.equal(peek.body.status, 'expired');
    assert.equal((await api(base(ev.id), { key: ev.key })).body.cohosts[0].status, 'expired');
    // Re-inviting makes a fresh, working link; the old one stops.
    const fresh = await invite(ev.id, ev.key, co);
    assert.equal((await accept(ev.id, secret, co)).status, 404);
    assert.equal((await accept(ev.id, fresh, co)).status, 200);
  });

  it('declining removes the invite', async () => {
    const ev = await event();
    const co = await member();
    const secret = await invite(ev.id, ev.key, co);
    assert.equal((await api(`${base(ev.id)}/cohosts/decline`, { method: 'POST', body: { invite: secret } })).status, 200);
    assert.equal((await accept(ev.id, secret, co)).status, 404);
    assert.deepEqual((await api(base(ev.id), { key: ev.key })).body.cohosts, []);
  });

  it('at most 5 co-hosts, active and pending together', async () => {
    const ev = await event();
    for (let i = 0; i < 5; i++) await invite(ev.id, ev.key, await member());
    const res = await api(`${base(ev.id)}/cohosts`, { method: 'POST', key: ev.key, body: { memberId: await member() } });
    assert.equal(res.status, 409);
    assert.equal(res.message, 'tooManyCohosts');
  });

  it('inviting an active co-host needs an explicit re-issue', async () => {
    const { ev, co } = await withCohost();
    const res = await api(`${base(ev.id)}/cohosts`, { method: 'POST', key: ev.key, body: { memberId: co } });
    assert.equal(res.status, 409);
    assert.equal(res.message, 'alreadyCohost');
  });
});

describe('access', () => {
  it('a named co-host can edit and move the event on, but not reopen, cancel, delete or manage links', async () => {
    const { ev, key } = await withCohost();
    assert.equal((await note(ev.id, key)).status, 200);
    const host = await api(base(ev.id), { key });
    assert.equal(host.body.role, 'cohost');
    for (const [method, path, body] of [
      ['PATCH', '', { cancel: '' }],
      ['DELETE', '', undefined],
      ['POST', '/cohost', undefined],
      ['POST', '/cohosts', { memberId: ev.createdBy }],
      ['DELETE', '/cohost', undefined],
    ] as const) {
      const res = await api(base(ev.id) + path, { method, key, body });
      assert.equal(res.status, 403, `${method} ${path}`);
    }
  });

  it('revoking cuts access at the next request', async () => {
    const { ev, co, key } = await withCohost();
    assert.equal((await api(`${base(ev.id)}/cohosts/${co}`, { method: 'DELETE', key: ev.key })).status, 200);
    assert.equal((await note(ev.id, key)).status, 403);
    assert.equal((await api(base(ev.id), { key })).body.role, null);
  });

  it('leaving cuts access, and a co-host cannot remove anyone else', async () => {
    const { ev, co, key } = await withCohost();
    const other = await member();
    await invite(ev.id, ev.key, other);
    assert.equal((await api(`${base(ev.id)}/cohosts/${other}`, { method: 'DELETE', key })).status, 403);
    assert.equal((await api(`${base(ev.id)}/cohosts/${co}`, { method: 'DELETE', key })).status, 200);
    assert.equal((await note(ev.id, key)).status, 403);
  });

  it('re-issuing cuts active access until the new invite is accepted', async () => {
    const { ev, co, key } = await withCohost();
    const fresh = await invite(ev.id, ev.key, co, { reissue: true });
    assert.equal((await note(ev.id, key)).status, 403);
    const res = await accept(ev.id, fresh, co);
    assert.equal(res.status, 200);
    assert.notEqual(res.body.key, key);
    assert.equal((await note(ev.id, res.body.key)).status, 200);
  });

  it('pending and expired rows are visible to organizers only; active co-hosts are public', async () => {
    const { ev, key } = await withCohost();
    await invite(ev.id, ev.key, await member());
    const asHost = (await api(base(ev.id), { key: ev.key })).body.cohosts;
    const asCohost = (await api(base(ev.id), { key })).body.cohosts;
    const asGuest = (await api(base(ev.id))).body.cohosts;
    assert.equal(asHost.length, 2);
    assert.equal(asCohost.length, 2);
    assert.deepEqual(asGuest.map((c: { status: string }) => c.status), ['active']);
  });

  it('the legacy shared co-host key keeps working until it is revoked', async () => {
    const ev = await event();
    const legacy = await cohostKey(ev.id, ev.key);
    assert.equal((await note(ev.id, legacy)).status, 200);
    assert.equal((await api(`${base(ev.id)}/cohost`, { method: 'DELETE', key: ev.key })).status, 200);
    assert.equal((await note(ev.id, legacy)).status, 403);
  });
});
