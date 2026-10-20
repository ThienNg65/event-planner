import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanup, event, member, query, startServer, stopServer } from './harness.ts';

/** The attendance check that rides on entering the bill: walk-ins, no-shows and a seat limit the real party exceeds. */
before(startServer);
afterEach(cleanup);
after(stopServer);

const patch = (id: number, key: string | undefined, body: unknown) => api(`/api/events/${id}`, { method: 'PATCH', key, body });
const answer = (id: number, me: number, status: string, guests = 0) => api(`/api/events/${id}/response`, { method: 'PUT', me, body: { memberId: me, status, guests } });
const start = (id: number) => query(`UPDATE events SET starts_at = now() - interval '1 hour' WHERE id = $1`, [id]);
const rowOf = async (id: number, memberId: number) =>
  (await query(`SELECT status, guests, no_show, derived FROM responses WHERE event_id = $1 AND member_id = $2`, [id, memberId]))[0];

/** Seat limit 2: A and B have the seats, D waits, C said Maybe. A and C (+1 friend) came. */
async function party() {
  const ev = await event({ pollDays: [], startsAt: new Date(Date.now() + 10 * 86_400_000).toISOString(), venue: 'zz-test-venue', capacity: 2 });
  const [a, b, c, d] = [await member(), await member(), await member(), await member()];
  await answer(ev.id, a, 'going');
  await answer(ev.id, b, 'going');
  await answer(ev.id, c, 'maybe');
  await answer(ev.id, d, 'going');
  await start(ev.id);
  return { ...ev, a, b, c, d };
}

describe('attendance check at the bill', () => {
  /** Ticked walk-ins owe a share, a seat holder who didn't come is a no-show, the waitlisted one just drops, and the limit grows. */
  it('applies the checklist, the bill and a raised seat limit together', async () => {
    const ev = await party();
    const res = await patch(ev.id, ev.key, { stage: 'bill', billTotal: 90_000, attended: [{ memberId: ev.a, guests: 0 }, { memberId: ev.c, guests: 1 }] });
    assert.equal(res.status, 200);
    assert.deepEqual(await rowOf(ev.id, ev.a), { status: 'going', guests: 0, no_show: false, derived: null });
    assert.deepEqual(await rowOf(ev.id, ev.c), { status: 'going', guests: 1, no_show: false, derived: null });
    assert.deepEqual(await rowOf(ev.id, ev.b), { status: 'no', guests: 0, no_show: true, derived: null });
    assert.deepEqual(await rowOf(ev.id, ev.d), { status: 'no', guests: 0, no_show: false, derived: null });
    const detail = (await api(`/api/events/${ev.id}`, { key: ev.key })).body;
    assert.deepEqual([detail.event.stage, detail.event.capacity, detail.event.plannedCapacity, detail.seats, detail.share], ['bill', 3, 2, 3, 30_000]);
    assert.deepEqual(detail.waitlist, []);
  });

  /** A (sponsor 60k) and C (+1 friend) came: A pays 60k, the other 30k splits over C and the friend. */
  it('stores a sponsor amount and splits the rest over the other seats', async () => {
    const ev = await party();
    const res = await patch(ev.id, ev.key, { stage: 'bill', billTotal: 90_000, attended: [{ memberId: ev.a, guests: 0, sponsor: 60_000 }, { memberId: ev.c, guests: 1 }] });
    assert.equal(res.status, 200);
    assert.equal((await query(`SELECT sponsor_amount FROM responses WHERE event_id = $1 AND member_id = $2`, [ev.id, ev.a]))[0]!.sponsor_amount, 60_000);
    assert.equal((await api(`/api/events/${ev.id}`, { key: ev.key })).body.share, 15_000);
  });

  it('refuses sponsors that exceed the bill or are not whole amounts', async () => {
    const ev = await party();
    for (const sponsor of [100_000, -1, 1.5]) {
      const res = await patch(ev.id, ev.key, { stage: 'bill', billTotal: 90_000, attended: [{ memberId: ev.a, guests: 0, sponsor }] });
      assert.equal(res.status, 400);
    }
    assert.equal((await rowOf(ev.id, ev.a))!.status, 'going');
  });

  /** A party that fits keeps the limit and leaves no "planned" trace; a bill without the checklist works as before. */
  it('leaves the limit alone when everyone fits, and is optional', async () => {
    const fits = await party();
    await patch(fits.id, fits.key, { stage: 'bill', billTotal: 1000, attended: [{ memberId: fits.a, guests: 0 }] });
    const [e] = await query(`SELECT capacity, planned_capacity FROM events WHERE id = $1`, [fits.id]);
    assert.deepEqual(e, { capacity: 2, planned_capacity: null });

    const plain = await party();
    assert.equal((await patch(plain.id, plain.key, { stage: 'bill', billTotal: 1000 })).status, 200);
    assert.equal((await rowOf(plain.id, plain.b))!.status, 'going');
    assert.equal((await rowOf(plain.id, plain.d))!.status, 'going', 'still waitlisted, untouched');
  });

  /** Two organizers entering the bill at once: one wins, and only the winner's checklist is applied. */
  it('applies one checklist when two bill entries race', async () => {
    const ev = await party();
    const [x, y] = await Promise.all([
      patch(ev.id, ev.key, { stage: 'bill', billTotal: 1000, attended: [{ memberId: ev.a, guests: 0 }] }),
      patch(ev.id, ev.key, { stage: 'bill', billTotal: 1000, attended: [{ memberId: ev.b, guests: 0 }] }),
    ]);
    assert.deepEqual([x.status, y.status].sort(), [200, 409]);
    const winner = x.status === 200 ? ev.a : ev.b;
    const loser = winner === ev.a ? ev.b : ev.a;
    assert.equal((await rowOf(ev.id, winner))!.status, 'going');
    assert.deepEqual(await rowOf(ev.id, loser), { status: 'no', guests: 0, no_show: true, derived: null });
  });

  /** Only on entering the bill, only participants, distinct members and a valid guest count. */
  it('refuses a bad checklist', async () => {
    const ev = await party();
    const stranger = await member();
    const bad = [
      [{ stage: 'bill', billTotal: 1000, attended: [{ memberId: stranger, guests: 0 }] }, 'invalid'],
      [{ stage: 'bill', billTotal: 1000, attended: [{ memberId: ev.a }, { memberId: ev.a }] }, 'invalid'],
      [{ stage: 'bill', billTotal: 1000, attended: [{ memberId: ev.a, guests: 11 }] }, 'invalidGuests'],
      [{ stage: 'settled', attended: [] }, 'invalid'],
      [{ title: 'zz-test-x', attended: [] }, 'invalid'],
    ] as const;
    for (const [body, message] of bad) {
      const res = await patch(ev.id, ev.key, body);
      assert.deepEqual([res.status, res.message], [400, message], JSON.stringify(body));
    }
    assert.equal((await query(`SELECT stage FROM events WHERE id = $1`, [ev.id]))[0]!.stage, 'rsvp');
  });

  /** Any later answer replaces "didn't come": an organizer moving the no-show to Going in the bill stage gives them a share. */
  it('clears the no-show flag on a new answer', async () => {
    const ev = await party();
    await patch(ev.id, ev.key, { stage: 'bill', billTotal: 1000, attended: [{ memberId: ev.a, guests: 0 }] });
    const res = await api(`/api/events/${ev.id}/response`, { method: 'PUT', key: ev.key, body: { memberId: ev.b, status: 'going' } });
    assert.equal(res.status, 200);
    assert.deepEqual(await rowOf(ev.id, ev.b), { status: 'going', guests: 0, no_show: false, derived: null });
  });

  /** Reopening to the poll: a no-show had said Going, so they start unanswered. */
  it('resets no-shows when reopened to the poll', async () => {
    const ev = await party();
    await patch(ev.id, ev.key, { stage: 'bill', billTotal: 1000, attended: [{ memberId: ev.a, guests: 0 }] });
    const res = await patch(ev.id, ev.key, { stage: 'poll', reopenVoting: true, voteDeadline: null });
    assert.equal(res.status, 200, res.message);
    assert.deepEqual(await rowOf(ev.id, ev.b), { status: null, guests: 0, no_show: false, derived: null });
  });
});
