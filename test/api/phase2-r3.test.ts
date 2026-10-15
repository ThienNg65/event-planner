import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanup, event, member, query, startServer, stopServer } from './harness.ts';

/** Phase 2 R3: the creator offers the event to an active co-host with a PIN; the target accepts while signed in. */
before(startServer);
afterEach(cleanup);
after(stopServer);

const base = (id: number) => `/api/events/${id}`;
const offer = (id: number, me: number | undefined, to: number, key?: string) => api(`${base(id)}/handover`, { method: 'POST', me, key, body: { to } });
const accept = (id: number, me?: number) => api(`${base(id)}/handover/accept`, { method: 'POST', me });
const withdraw = (id: number, me?: number) => api(`${base(id)}/handover`, { method: 'DELETE', me });
const get = async (id: number, me?: number, key?: string) => (await api(base(id), { me, key })).body;
/** An event whose creator has made `n` members active co-hosts. */
async function withCohosts(n = 1) {
  const ev = await event();
  const cos: number[] = [];
  for (let i = 0; i < n; i++) {
    const co = await member();
    const invite = (await api(`${base(ev.id)}/cohosts`, { method: 'POST', key: ev.key, body: { memberId: co } })).body.invite;
    assert.equal((await api(`${base(ev.id)}/cohosts/accept`, { method: 'POST', me: co, body: { invite } })).status, 200);
    cos.push(co);
  }
  return { ev, cos };
}
const creatorOf = async (id: number) => (await query('SELECT created_by FROM events WHERE id = $1', [id]))[0]!.created_by;

describe('hand an event over', () => {
  it('offer, accept: rights move, the old host becomes a co-host, the new key works and the old one does not', async () => {
    const { ev, cos: [co] } = await withCohosts();
    assert.equal((await offer(ev.id, ev.createdBy, co!)).status, 200);
    const done = await accept(ev.id, co);
    assert.equal(done.status, 200);
    const key = done.body.key as string;
    assert.equal(await creatorOf(ev.id), co);
    assert.equal((await get(ev.id, co, key)).hostKey, true);
    assert.equal((await get(ev.id, undefined, ev.key)).role, null, 'the old manage key is dead');
    const old = await get(ev.id, ev.createdBy);
    assert.equal(old.role, 'cohost');
    assert.deepEqual(old.cohosts.map((c: { memberId: number }) => c.memberId), [ev.createdBy]);
    assert.equal(old.handover, null);
    assert.equal((await api(`${base(ev.id)}/handover/accept`, { method: 'POST', me: co })).status, 409, 'accepting twice is stale');
  });

  it('only the signed-in creator may offer, and only to an active co-host with a PIN', async () => {
    const { ev, cos: [co] } = await withCohosts();
    const stranger = await member();
    assert.equal((await offer(ev.id, undefined, co!, ev.key)).message, 'creatorOnly', 'a manage key alone is not enough');
    assert.equal((await offer(ev.id, co, co!)).status, 403);
    assert.equal((await offer(ev.id, ev.createdBy, stranger)).message, 'handoverTarget');
    assert.equal((await offer(ev.id, ev.createdBy, ev.createdBy)).status, 400);
    await query('UPDATE members SET pin_hash = NULL WHERE id = $1', [co]);
    assert.equal((await offer(ev.id, ev.createdBy, co!)).message, 'handoverTarget');
  });

  it('the offer is visible only to the creator and the target; everyone else sees nothing', async () => {
    const { ev, cos: [co] } = await withCohosts();
    await offer(ev.id, ev.createdBy, co!);
    const other = await member();
    assert.equal((await get(ev.id, ev.createdBy)).handover.to, co);
    assert.equal((await get(ev.id, co)).handover.mine, true);
    assert.equal((await get(ev.id, other)).handover, null);
    assert.equal((await get(ev.id, undefined, ev.key)).handover, null);
    assert.equal('handoverTo' in (await get(ev.id, co)).event, false);
  });

  it('a replaced offer makes the first target stale; a withdrawn one fails for everybody', async () => {
    const { ev, cos: [a, b] } = await withCohosts(2);
    await offer(ev.id, ev.createdBy, a!);
    await offer(ev.id, ev.createdBy, b!);
    assert.equal((await accept(ev.id, a)).status, 409);
    assert.equal(await creatorOf(ev.id), ev.createdBy);
    assert.equal((await withdraw(ev.id, ev.createdBy)).status, 200);
    assert.equal((await accept(ev.id, b)).status, 409);
    assert.equal(await creatorOf(ev.id), ev.createdBy);
  });

  it('the target can decline; an outsider cannot withdraw', async () => {
    const { ev, cos: [co] } = await withCohosts();
    await offer(ev.id, ev.createdBy, co!);
    await withdraw(ev.id, await member());
    assert.equal((await get(ev.id, co)).handover.mine, true);
    await withdraw(ev.id, co);
    assert.equal((await get(ev.id, ev.createdBy)).handover, null);
  });

  it('removing or re-inviting the target co-host clears the offer', async () => {
    const { ev, cos: [a, b] } = await withCohosts(2);
    await offer(ev.id, ev.createdBy, a!);
    assert.equal((await api(`${base(ev.id)}/cohosts/${a}`, { method: 'DELETE', key: ev.key })).status, 200);
    assert.equal((await get(ev.id, ev.createdBy)).handover, null);
    assert.equal((await accept(ev.id, a)).status, 409);
    await offer(ev.id, ev.createdBy, b!);
    await api(`${base(ev.id)}/cohosts`, { method: 'POST', key: ev.key, body: { memberId: b, reissue: true } });
    assert.equal((await get(ev.id, ev.createdBy)).handover, null);
    assert.equal(await creatorOf(ev.id), ev.createdBy);
  });

  it('a target who lost their PIN meanwhile cannot accept', async () => {
    const { ev, cos: [co] } = await withCohosts();
    await offer(ev.id, ev.createdBy, co!);
    await query('UPDATE members SET pin_hash = NULL WHERE id = $1', [co]);
    assert.equal((await accept(ev.id, co)).status, 409);
    assert.equal(await creatorOf(ev.id), ev.createdBy);
  });

  it('two simultaneous accepts: exactly one wins and there is one co-host row for the old host', async () => {
    const { ev, cos: [co] } = await withCohosts();
    await offer(ev.id, ev.createdBy, co!);
    const results = await Promise.all([accept(ev.id, co), accept(ev.id, co)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const rows = await query('SELECT member_id FROM cohosts WHERE event_id = $1', [ev.id]);
    assert.deepEqual(rows.map((r) => r.member_id), [ev.createdBy]);
  });
});
