/** Case/diacritic-insensitive form of a name: "THIÊN", "Thiên" and "thien" all become "thien". */
export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export type QueueEntry = { memberId: number; status: string | null; guests: number; goingAt: Date | null };

/**
 * Splits "going" responses into confirmed and waitlisted, strictly first-come by goingAt (memberId breaks ties).
 * Each entry takes 1 + guests seats; once a party doesn't fit, it and everyone after it wait.
 */
export function rollCall<T extends QueueEntry>(responses: T[], capacity: number | null) {
  const queue = responses
    .filter((r) => r.status === 'going' && r.goingAt)
    .sort((a, b) => a.goingAt!.getTime() - b.goingAt!.getTime() || a.memberId - b.memberId);
  const confirmed: T[] = [];
  const waitlist: T[] = [];
  let seats = 0;
  for (const r of queue) {
    if (!waitlist.length && (capacity === null || seats + 1 + r.guests <= capacity)) {
      confirmed.push(r);
      seats += 1 + r.guests;
    } else {
      waitlist.push(r);
    }
  }
  return { confirmed, waitlist, seats };
}

/** Per-seat share of the bill, rounded up to 1,000 VND; null when there is no bill or nobody to split it with. */
export const shareOf = (bill: number | null, seats: number) =>
  bill === null || seats === 0 ? null : Math.ceil(bill / seats / 1000) * 1000;

/** VietQR quick-link image for a transfer of `amount` VND; the note is ASCII-only, max 50 chars (bank limit). */
export function vietqrUrl(bankId: string, account: string, holder: string | null, amount: number, note: string) {
  const addInfo = norm(note).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 50);
  const q = new URLSearchParams({ amount: String(amount), addInfo, accountName: holder ?? '' });
  return `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(account)}-compact2.png?${q}`;
}

type PayRow = { paidAt: unknown; paidAmount?: number | null };

/** What a member has paid of `owes`; a legacy row (paidAt, no amount) counts as paid in full, an overpayment leaves nothing. */
export function paymentOf(row: PayRow | undefined, owes: number) {
  const paid = row?.paidAmount ?? (row?.paidAt ? owes : 0);
  const left = Math.max(0, owes - paid);
  return { paid, left, done: left === 0 };
}

/** True when there is a share and every confirmed attendee has paid theirs. */
export const allPaid = (confirmed: (PayRow & { guests: number })[], share: number | null) =>
  share !== null && confirmed.length > 0 && confirmed.every((r) => paymentOf(r, share * (1 + r.guests)).done);

/** Voting is open while the event is polling, not cancelled and before the deadline (if any). */
export const votingOpen = (ev: { stage: string; cancelledAt?: unknown; voteDeadline?: string | Date | null }, now = Date.now()) =>
  ev.stage === 'poll' && !ev.cancelledAt && (!ev.voteDeadline || now < new Date(ev.voteDeadline).getTime());

/** The visitor's own state on one event, as the home list and the event page both need it. */
export type Mine = {
  voted: boolean;
  status: string | null;
  waitlisted: boolean;
  owes: number | null;
  paid: boolean;
  paidAmount: number;
  left: number;
};

type MyRow = PayRow & { days: string[]; venueIds: number[]; status: string | null; guests: number };

/** `row` is the member's response (absent if they never answered); only confirmed attendees owe a share. */
export function mineOf(row: MyRow | undefined, confirmed: boolean, waitlisted: boolean, share: number | null): Mine {
  const owes = confirmed && share !== null ? share * (1 + row!.guests) : null;
  const pay = owes === null ? null : paymentOf(row, owes);
  return {
    voted: !!row && (row.days.length > 0 || row.venueIds.length > 0),
    status: row?.status ?? null,
    waitlisted,
    owes,
    paid: !!pay?.done,
    paidAmount: pay?.paid ?? 0,
    left: pay?.left ?? 0,
  };
}

export type Step =
  | 'vote'
  | 'voted'
  | 'voteClosed'
  | 'rsvp'
  | 'going'
  | 'waitlist'
  | 'replied'
  | 'pay'
  | 'paid'
  | 'done'
  | 'settled'
  | 'cancelled';
export type OrganizerAction = 'lock' | 'bill' | 'settle';

/**
 * What the visitor should do next, and the organizer's next move (null when not managing or nothing is due).
 * `started`: the event's date has passed, so RSVP no longer matters and the bill can be entered.
 * `votingClosed`: the poll's deadline has passed; `cancelled` overrides everything.
 */
export function nextStep(o: {
  stage: string;
  mine: Mine | null;
  manager: boolean;
  allPaid: boolean;
  started: boolean;
  cancelled?: boolean;
  votingClosed?: boolean;
}) {
  const { stage, mine, manager, allPaid, started } = o;
  if (o.cancelled) return { step: 'cancelled' as Step, action: null };
  let step: Step = 'done';
  if (stage === 'poll') step = o.votingClosed ? 'voteClosed' : mine?.voted ? 'voted' : 'vote';
  else if (stage === 'rsvp') {
    if (mine?.status === 'going') step = mine.waitlisted ? 'waitlist' : 'going';
    else if (mine?.status) step = 'replied';
    else if (!started) step = 'rsvp';
  } else if (stage === 'bill') {
    if (mine?.owes != null) step = mine.paid ? 'paid' : 'pay';
  } else step = 'settled';

  let action: OrganizerAction | null = null;
  if (manager && stage === 'poll') action = 'lock';
  if (manager && stage === 'rsvp' && started) action = 'bill';
  if (manager && stage === 'bill' && allPaid) action = 'settle';
  return { step, action };
}

/** Steps that ask the visitor to do something. */
export const TODO_STEPS: readonly Step[] = ['vote', 'rsvp', 'pay'];

const isEmpty = (v: unknown) => v === null || v === undefined || v === '';
const tidy = (v: unknown) => {
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return [...v].sort().join();
  return v;
};

/**
 * The fields of `form` whose value differs from `snapshot`, with strings trimmed and empty values (null, undefined, '')
 * as null. An untouched form gives `{}`, so a save only sends what the organizer actually edited.
 */
export function changedFields<T extends Record<string, unknown>>(snapshot: T, form: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(form)) {
    const a = snapshot[k];
    const b = form[k];
    if (isEmpty(tidy(a)) && isEmpty(tidy(b))) continue;
    if (tidy(a) === tidy(b)) continue;
    out[k] = isEmpty(tidy(b)) ? null : typeof b === 'string' ? b.trim() : b;
  }
  return out as Partial<T>;
}

/** The votes that dropping days from the poll would delete: one entry per removed day that has voters, in date order. */
export function dayRemovalImpact(current: string[], next: string[], responses: { name: string; days: string[] }[]) {
  return current
    .filter((d) => !next.includes(d))
    .sort()
    .map((day) => ({ day, names: responses.filter((r) => r.days.includes(day)).map((r) => r.name) }))
    .filter((r) => r.names.length > 0);
}

/**
 * Who a seat limit change (`from` → `to`) moves: `waitlisted` were confirmed and now wait, `promoted` were waiting and now get a seat.
 * It runs `rollCall` on both limits, so it follows the same strict first-come rules the page shows.
 */
export function capacityImpact<T extends QueueEntry>(responses: T[], from: number | null, to: number | null) {
  const before = rollCall(responses, from);
  const after = rollCall(responses, to);
  const wasWaiting = new Set(before.waitlist.map((r) => r.memberId));
  const nowWaiting = new Set(after.waitlist.map((r) => r.memberId));
  return {
    waitlisted: after.waitlist.filter((r) => !wasWaiting.has(r.memberId)),
    promoted: after.confirmed.filter((r) => wasWaiting.has(r.memberId) && !nowWaiting.has(r.memberId)),
  };
}

/** Roster members who have not voted yet (no day and no place picked), in roster order. */
export const pendingVoters = <M extends { id: number }>(roster: M[], responses: { memberId: number; days: unknown[]; venueIds: unknown[] }[]) => {
  const voted = new Set(responses.filter((r) => r.days.length || r.venueIds.length).map((r) => r.memberId));
  return roster.filter((m) => !voted.has(m.id));
};
