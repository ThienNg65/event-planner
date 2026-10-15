import { paymentOf, rollCall, seated, shareOf } from './event.ts';

export const NOTIFY_KINDS = ['planSet', 'paymentRequested', 'paymentRecorded', 'cancelled'] as const;
export type NotifyKind = (typeof NOTIFY_KINDS)[number];
export const isNotifyKind = (v: unknown): v is NotifyKind => NOTIFY_KINDS.includes(v as never);

/** Sends one notification may make in a single run: each costs two requests, and Workers allow 50 per invocation. */
export const SENDS_PER_RUN = 15;
/** Runs before a notification that keeps failing is given up. */
export const MAX_ATTEMPTS = 5;
/** A notification over the day's mail budget waits this long. */
export const BUDGET_RETRY_MS = 24 * 3_600_000;

type At = Date | string | null | undefined;
const ms = (d: At) => (d ? String(new Date(d).getTime()) : '');

/** Date and place as one comparable string. */
export const planFact = (ev: { startsAt: At; venue: string | null }) => `${ms(ev.startsAt)}|${ev.venue ?? ''}`;
/**
 * What a plan change announces: from the old plan to the new one. Going back to an earlier plan is a new fact (A→B, then B→A),
 * so it is announced again; saving the same change twice is not.
 */
export const planSetFact = (prev: { startsAt: At; venue: string | null }, next: { startsAt: At; venue: string | null }) => `${planFact(prev)}→${planFact(next)}`;
/** What entering or changing the bill announces: the previous total (empty when none) → the new one. */
export const billFact = (prev: number | null, next: number) => `${prev ?? ''}→${next}`;
/** The instant a payment was recorded or an event was cancelled. */
export const timeFact = (at: Date | string) => ms(at);

export type Notice = { kind: NotifyKind; fact: string; memberId: number | null };
export type NoticeEvent = {
  stage: string;
  startsAt: At;
  venue: string | null;
  billTotal: number | null;
  capacity: number | null;
  cancelledAt: At;
  reconfirmBy: At;
};
export type NoticeRow = { memberId: number; status: string | null; guests: number; goingAt: Date | null; derived: string | null; paidAt: At; paidAmount: number | null };
export type Audience = { memberId: number; owes?: number };

/**
 * Who a queued notification is still for, worked out from the event as it is now. Null means drop it: the news is out of date
 * (the plan or bill moved on, the payment was undone, the event was restored) or the event is cancelled (only the cancellation
 * itself is still sent). Seats come from `seated`/`rollCall`, like the event page, so a lapsed hold gets nothing.
 */
export function audienceOf(n: Notice, ev: NoticeEvent, rows: NoticeRow[], now = Date.now()): Audience[] | null {
  if (n.kind === 'cancelled' ? !ev.cancelledAt || timeFact(ev.cancelledAt) !== n.fact : ev.cancelledAt) return null;
  if (n.kind === 'paymentRecorded') {
    const row = rows.find((r) => r.memberId === n.memberId);
    return row?.paidAt && timeFact(row.paidAt) === n.fact ? [{ memberId: row.memberId }] : null;
  }
  const { confirmed, waitlist, seats } = rollCall(seated(rows, ev, now), ev.capacity);
  if (n.kind === 'paymentRequested') {
    if (ev.stage !== 'bill' || ev.billTotal === null || !n.fact.endsWith(`→${ev.billTotal}`)) return null;
    const share = shareOf(ev.billTotal, seats);
    return confirmed.flatMap((r) => {
      const owes = share === null ? 0 : paymentOf(r, share * (1 + r.guests)).left;
      return owes > 0 ? [{ memberId: r.memberId, owes }] : [];
    });
  }
  if (n.kind === 'planSet' && !n.fact.endsWith(`→${planFact(ev)}`)) return null;
  return [...confirmed, ...waitlist].map((r) => ({ memberId: r.memberId }));
}

export type Contact = { email: string; locale: string; muted: string[] };

/** The audience members who have a verified address and have not muted this kind. */
export const reachable = (audience: Audience[], contacts: Map<number, Contact>, kind: NotifyKind) =>
  audience.flatMap((a) => {
    const c = contacts.get(a.memberId);
    return c && !c.muted.includes(kind) ? [{ ...a, ...c }] : [];
  });

/** What to do with a mail that could not be sent: out of budget → give the place back and try tomorrow; anything else → it counts as sent (at most once). */
export const afterSendError = (e: unknown): 'defer' | 'lose' => ((e as { statusMessage?: string })?.statusMessage === 'mailBudget' ? 'defer' : 'lose');

/** When a notification that failed unexpectedly is tried again (10 min, 20 min, …), or null once it is given up. */
export const retryAt = (attempts: number, now = new Date()) => (attempts >= MAX_ATTEMPTS ? null : new Date(now.getTime() + attempts * 10 * 60_000));
