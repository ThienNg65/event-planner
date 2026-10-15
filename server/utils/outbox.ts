import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { H3Event } from 'h3';
import { fmtDateTime, fmtVnd } from '../../app/utils/format';

/**
 * Event emails go through a transactional outbox (docs/13). A state change that deserves a mail writes a `notifications` row in
 * the SAME `db.batch` (guarded on the state just written, `ON CONFLICT DO NOTHING` on the fact), so a mail is queued exactly
 * when the change committed. After the commit `dispatch` claims the due rows, works out the recipients from the event as it is
 * then, and sends. While email is off nothing is queued at all: the hot path pays one config read.
 */

type Queued = { kind: NotifyKind; eventId: number; memberId?: number; fact: string; guard: SQL };

/** The batch item that queues one notification (nothing while email is off). `guard` is a boolean SQL expression. */
function enqueue({ kind, eventId, memberId, fact, guard }: Queued): BatchItem<'pg'>[] {
  if (!emailEnabled()) return [];
  return [
    useDb().execute(
      sql`insert into notifications (kind, event_id, member_id, fact) select ${kind}::text, ${eventId}::int, ${memberId ?? null}::int, ${fact}::text where ${guard} on conflict do nothing`
    ),
  ];
}

type PlanState = { stage: string; startsAt: Date | null; venue: string | null };

/** The date or place of an event changed from `prev` to `next` (the state the batch's event UPDATE writes). */
export const queuePlanSet = (eventId: number, prev: PlanState, next: PlanState) =>
  enqueue({
    kind: 'planSet',
    eventId,
    fact: planSetFact(prev, next),
    guard: sql`exists (select 1 from events where id = ${eventId} and stage = ${next.stage}::text and cancelled_at is null and starts_at is not distinct from ${next.startsAt}::timestamptz and venue is not distinct from ${next.venue}::text)`,
  });

/** The bill total became `total` (entering the bill stage, or a changed total while in it); every unpaid seat holder is asked to pay. */
export const queuePaymentRequested = (eventId: number, prev: number | null, total: number) =>
  enqueue({
    kind: 'paymentRequested',
    eventId,
    fact: billFact(prev, total),
    guard: sql`exists (select 1 from events where id = ${eventId} and stage = 'bill' and cancelled_at is null and bill_total = ${total}::int)`,
  });

/** An organizer recorded a payment for `memberId` at `at` (the value the batch's upsert writes). */
export const queuePaymentRecorded = (eventId: number, memberId: number, at: Date) =>
  enqueue({
    kind: 'paymentRecorded',
    eventId,
    memberId,
    fact: timeFact(at),
    guard: sql`exists (select 1 from responses r join events e on e.id = r.event_id where r.event_id = ${eventId} and r.member_id = ${memberId}::int and r.paid_at = ${at}::timestamptz and e.cancelled_at is null)`,
  });

/** The event was cancelled at `at` (the value the batch's event UPDATE writes). */
export const queueCancelled = (eventId: number, at: Date) =>
  enqueue({ kind: 'cancelled', eventId, fact: timeFact(at), guard: sql`exists (select 1 from events where id = ${eventId} and cancelled_at = ${at}::timestamptz)` });

/** Netlify cannot run work after the response, so the request waits this long for the mails before answering anyway. */
const INLINE_CAP_MS = 3000;

/**
 * Runs `work` once the state change is committed. Cloudflare Workers keep it alive after the response (`waitUntil`); elsewhere
 * (Netlify has no such hook) the request waits for it, but at most `INLINE_CAP_MS`. What does not finish is still queued and the
 * scheduled tick picks it up.
 */
export async function afterCommit(event: H3Event, work: Promise<unknown>) {
  const safe = work.catch((e) => console.error('[outbox]', e));
  if (typeof event.context.waitUntil === 'function') return event.waitUntil(safe);
  let timer: ReturnType<typeof setTimeout>;
  await Promise.race([safe, new Promise((done) => (timer = setTimeout(done, INLINE_CAP_MS)))]);
  clearTimeout(timer!);
}

/** Runs `writes` and the notifications they queued (`outbox`) as one batch, returns the results of `writes`, then sends what was queued. */
export async function commit(event: H3Event, eventId: number, writes: BatchItem<'pg'>[], outbox: BatchItem<'pg'>[]) {
  const results = await useDb().batch([...writes, ...outbox] as [BatchItem<'pg'>, ...BatchItem<'pg'>[]]);
  if (outbox.length) await afterCommit(event, dispatch(eventId));
  return results.slice(0, writes.length);
}

type Claimed = { id: number; kind: NotifyKind; eventId: number; memberId: number | null; fact: string; attempts: number };

/** The link in a notification mail that mutes `kind` for `memberId` (a page that confirms first, see `/api/unsubscribe`). */
export function unsubscribeUrl(c: { appUrl: string; secret: string }, memberId: number, kind: NotifyKind, locale: string) {
  return `${c.appUrl}/api/unsubscribe?t=${signToken(c.secret, `unsub:${memberId}:${kind}`)}&l=${locale}`;
}

/**
 * Claims due notifications (of one event, or any) and sends them. The claim is one guarded UPDATE, so parallel dispatchers
 * never work on the same row; a crashed one is taken over when its 2-minute claim lapses.
 */
export async function dispatch(eventId?: number, limit = 5) {
  if (!emailEnabled()) return;
  const { rows } = await useDb().execute<Claimed>(sql`
    update notifications set claimed_until = now() + interval '2 minutes', attempts = attempts + 1
    where id in (
      select id from notifications
      where done_at is null and next_at <= now() and (claimed_until is null or claimed_until < now()) ${eventId === undefined ? sql`` : sql`and event_id = ${eventId}`}
      order by id limit ${limit} for update skip locked)
    returning id, kind, event_id as "eventId", member_id as "memberId", fact, attempts`);
  for (const n of rows) await deliver(n).catch((e) => giveBack(n, e));
}

/** An unexpected failure: try again later, or stop after `MAX_ATTEMPTS`. Mails already sent are in `notification_sends` and never repeat. */
async function giveBack(n: Claimed, e: unknown) {
  console.error('[outbox] notification', n.id, e);
  const at = retryAt(n.attempts);
  await useDb().execute(
    at
      ? sql`update notifications set claimed_until = null, next_at = ${at}::timestamptz where id = ${n.id}`
      : sql`update notifications set claimed_until = null, done_at = now() where id = ${n.id}`
  );
}

/** What becomes of a claimed notification: finished, due again at once (recipients left over), or after the budget wait. */
const AFTER = {
  done: sql`done_at = now()`,
  now: sql`next_at = now()`,
  tomorrow: sql`next_at = now() + make_interval(secs => ${BUDGET_RETRY_MS / 1000}::int), attempts = attempts - 1`,
};

const finish = (id: number, more: keyof typeof AFTER) => useDb().execute(sql`update notifications set claimed_until = null, ${AFTER[more]} where id = ${id}`);

async function deliver(n: Claimed) {
  const { events, responses, members, memberEmail, notificationSends: sends } = schema;
  const db = useDb();
  const [[ev], rows, sent] = await Promise.all([
    db.select().from(events).where(eq(events.id, n.eventId)),
    db.select().from(responses).where(eq(responses.eventId, n.eventId)),
    db.select({ id: sends.memberId }).from(sends).where(eq(sends.notificationId, n.id)),
  ]);
  const audience = ev ? audienceOf(n, ev, rows) : null;
  if (!ev || !audience) return finish(n.id, 'done');

  const people = audience.length
    ? await db
        .select({ id: memberEmail.memberId, name: members.name, email: memberEmail.email, locale: memberEmail.locale, muted: memberEmail.mutedKinds })
        .from(memberEmail)
        .innerJoin(members, eq(members.id, memberEmail.memberId))
        .where(inArray(memberEmail.memberId, audience.map((a) => a.memberId)))
    : [];
  const contacts = new Map(people.map((p) => [p.id, p]));
  const already = new Set(sent.map((s) => s.id));
  const pending = reachable(audience, contacts, n.kind).filter((r) => !already.has(r.memberId));
  const batch = pending.slice(0, SENDS_PER_RUN);

  // The place in `notification_sends` is taken BEFORE the mail goes out: a crash in between loses that one mail rather than sending it twice.
  const mine = batch.length
    ? await db
        .insert(sends)
        .values(batch.map((r) => ({ notificationId: n.id, memberId: r.memberId })))
        .onConflictDoNothing()
        .returning({ id: sends.memberId })
    : [];
  const won = new Set(mine.map((m) => m.id));
  const c = mailConfig();
  const url = `${c.appUrl}/e/${ev.id}`;
  const toSend = batch.filter((r) => won.has(r.memberId));
  for (const [i, r] of toSend.entries()) {
    const { name } = contacts.get(r.memberId)!;
    const stop = unsubscribeUrl(c, r.memberId, n.kind, r.locale);
    const qr =
      n.kind === 'paymentRequested' && ev.bankId && ev.bankAccount
        ? vietqrUrl(ev.bankId, ev.bankAccount, ev.bankHolder, r.owes!, `${ev.title} ${name}`)
        : '';
    try {
      await sendMail({
        kind: 'notify',
        to: r.email,
        template: n.kind,
        locale: r.locale,
        params: {
          title: ev.title,
          name,
          when: ev.startsAt ? fmtDateTime(ev.startsAt, r.locale) : '',
          place: ev.venue || '-',
          amount: r.owes === undefined ? '' : fmtVnd(r.owes),
          ...(qr ? { link: qr, link2: url } : { link2: url }),
          unsubscribe: stop,
        },
        headers: { 'List-Unsubscribe': `<${stop}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      });
    } catch (e) {
      if (afterSendError(e) === 'defer') {
        // Out of budget: give back this place and the ones not tried yet, and come back tomorrow.
        const left = toSend.slice(i).map((x) => x.memberId);
        await db.delete(sends).where(and(eq(sends.notificationId, n.id), inArray(sends.memberId, left)));
        return finish(n.id, 'tomorrow');
      }
      await db.update(sends).set({ error: 'failed' }).where(and(eq(sends.notificationId, n.id), eq(sends.memberId, r.memberId)));
    }
  }
  return finish(n.id, pending.length > batch.length ? 'now' : 'done');
}
