/** The place name in a full Google Maps link (`/maps/place/<name>/…`), or null. */
export function placeName(link?: string | null) {
  const m = link?.match(/\/maps\/place\/([^/?#]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]!.replace(/\+/g, ' ')).trim() || null;
  } catch {
    return null;
  }
}

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

/** `YYYY-MM-DD` of an instant in Vietnam time (UTC+7), the form poll days are stored in. */
export const teamDay = (d: Date | string) => new Date(new Date(d).getTime() + 7 * 3600_000).toISOString().slice(0, 10);

/** What the organizer locked in: the day (null when no day was polled) and the polled venues that carry the chosen place. */
export type Plan = { day: string | null; venuePolled: boolean; venueIds: number[] };

/** The plan a locked date and place give; a typed place that isn't a polled venue matches no venue. */
export const planFor = (
  pollDays: string[],
  startsAt: Date | string | null,
  venues: { id: number; name: string }[],
  venueName: string | null
): Plan => ({
  day: pollDays.length && startsAt ? teamDay(startsAt) : null,
  venuePolled: venues.length > 0,
  venueIds: venues.filter((v) => v.name === venueName).map((v) => v.id),
});

type Vote = { days: string[]; venueIds: number[] };

/**
 * Whether a member's votes fit the plan. A day poll needs the day; if places were polled too, a member who upvoted
 * places needs one of them (no place upvotes = the day alone). A place-only poll needs the chosen place.
 */
export function matchesPlan(r: Vote, plan: Plan) {
  const placeOk = r.venueIds.some((v) => plan.venueIds.includes(v));
  if (plan.day !== null) return r.days.includes(plan.day) && (!plan.venuePolled || !r.venueIds.length || placeOk);
  return plan.venuePolled && placeOk;
}

/** A held seat (derived `reconfirm`) is in force while the confirm-by deadline hasn't passed. */
export const heldOk = (ev: { reconfirmBy?: string | Date | null }, now = Date.now()) =>
  !!ev.reconfirmBy && now < new Date(ev.reconfirmBy).getTime();

/** The rows that occupy a seat or queue spot: going, except held seats whose deadline has passed. Feed this to `rollCall`. */
export const seated = <T extends { status: string | null; derived?: string | null }>(rows: T[], ev: { reconfirmBy?: string | Date | null }, now = Date.now()) =>
  rows.filter((r) => r.status === 'going' && (r.derived !== 'reconfirm' || heldOk(ev, now)));

/** Once the event has started or the bill is entered, date and place are fixed (changed only by a notice-backed correction). */
export const planFrozen = (ev: { stage: string; startsAt?: string | Date | null }, now = Date.now()) =>
  ev.stage === 'bill' || ev.stage === 'settled' || (ev.stage === 'rsvp' && !!ev.startsAt && new Date(ev.startsAt).getTime() <= now);

export type DerivRow = QueueEntry & Vote & { derived: string | null; paidAt: unknown; firstVotedAt: Date | null };

/**
 * Sorts members into what a plan change does to them. `lock`: unanswered voters who fit become `going`.
 * `edit`: only rows already derived are re-checked (fit → `going`, no fit → `hold`); expired holds are `release`d, never revived.
 * Paid rows and explicit answers are never touched.
 */
export function deriveAttendance<T extends DerivRow>(rows: T[], plan: Plan, mode: 'lock' | 'edit', ev: { reconfirmBy?: string | Date | null }, now = Date.now()) {
  const out = { release: [] as T[], going: [] as T[], hold: [] as T[], untouched: [] as T[] };
  for (const r of rows) {
    const expired = r.derived === 'reconfirm' && !heldOk(ev, now);
    if (mode === 'edit' && expired && !r.paidAt) out.release.push(r);
    else if (r.paidAt || expired) out.untouched.push(r);
    else if (mode === 'lock') (r.status === null && matchesPlan(r, plan) ? out.going : out.untouched).push(r);
    else if (r.derived === null) out.untouched.push(r);
    else (matchesPlan(r, plan) ? out.going : out.hold).push(r);
  }
  return out;
}

/**
 * The picture after a plan change, for previews: who is marked going, who waits behind the seat limit, who is held or released,
 * and who voted without fitting (asked to confirm). `at` is the lock time, used when a derived row has no first vote.
 */
export function lockImpact<T extends DerivRow>(rows: T[], plan: Plan, capacity: number | null, at: Date, ev: { reconfirmBy?: string | Date | null }, mode: 'lock' | 'edit', now = Date.now()) {
  const d = deriveAttendance(rows, plan, mode, ev, now);
  const after = rows.map((r) => {
    if (d.release.includes(r)) return { ...r, status: null, derived: null, goingAt: null };
    if (d.going.includes(r)) return { ...r, status: 'going', derived: 'going', goingAt: r.derived ? r.goingAt : (r.firstVotedAt ?? at) };
    if (d.hold.includes(r)) return { ...r, derived: 'reconfirm' };
    return r;
  });
  // Expired holds were released above, so every hold left in `after` is in time and keeps its spot.
  const { confirmed, waitlist } = rollCall(after.filter((r) => r.status === 'going'), capacity);
  const derivedIds = new Set(after.filter((r) => r.derived).map((r) => r.memberId));
  const voted = (r: Vote) => r.days.length > 0 || r.venueIds.length > 0;
  return {
    going: confirmed.filter((r) => derivedIds.has(r.memberId)),
    waiting: waitlist.filter((r) => derivedIds.has(r.memberId)),
    hold: d.hold,
    released: d.release,
    confirm: mode === 'lock' ? d.untouched.filter((r) => r.status === null && !r.paidAt && voted(r)) : [],
  };
}

/** The visitor's own state on one event, as the home list and the event page both need it. */
export type Mine = {
  voted: boolean;
  status: string | null;
  derived: string | null;
  /** The visitor's seat is held after a plan change and still in time to confirm. */
  held: boolean;
  waitlisted: boolean;
  owes: number | null;
  paid: boolean;
  paidAmount: number;
  left: number;
};

type MyRow = PayRow & { days: string[]; venueIds: number[]; status: string | null; guests: number; derived?: string | null };

/** `row` is the member's response (absent if they never answered); only confirmed attendees owe a share. `held`: a seated hold. */
export function mineOf(row: MyRow | undefined, confirmed: boolean, waitlisted: boolean, share: number | null, held = false): Mine {
  const owes = confirmed && share !== null ? share * (1 + row!.guests) : null;
  const pay = owes === null ? null : paymentOf(row, owes);
  return {
    voted: !!row && (row.days.length > 0 || row.venueIds.length > 0),
    status: row?.status ?? null,
    derived: row?.derived ?? null,
    held,
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
  | 'declined'
  | 'voteClosed'
  | 'rsvp'
  | 'confirm'
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
  if (stage === 'poll') {
    if (o.votingClosed) step = 'voteClosed';
    else if (mine?.status === 'no') step = 'declined';
    else step = mine?.voted ? 'voted' : 'vote';
  }
  else if (stage === 'rsvp') {
    // A held seat (still in time or expired) asks to be confirmed; its stored status is not the member's answer.
    if (mine?.derived === 'reconfirm') step = started ? 'done' : 'confirm';
    else if (mine?.status === 'going') step = mine.waitlisted ? 'waitlist' : 'going';
    else if (mine?.status) step = 'replied';
    else if (!started) step = mine?.voted ? 'confirm' : 'rsvp';
  } else if (stage === 'bill' || stage === 'settled') {
    // A debt stays payable after Completed.
    if (mine?.owes != null) step = mine.paid ? (stage === 'bill' ? 'paid' : 'settled') : 'pay';
    else if (stage === 'settled') step = 'settled';
  }

  let action: OrganizerAction | null = null;
  if (manager && stage === 'poll') action = 'lock';
  if (manager && stage === 'rsvp' && started) action = 'bill';
  if (manager && stage === 'bill' && allPaid) action = 'settle';
  return { step, action };
}

/** Steps that ask the visitor to do something. */
export const TODO_STEPS: readonly Step[] = ['vote', 'rsvp', 'confirm', 'pay'];

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

export type Attended = { memberId: number; guests: number };

/**
 * What the attendance check at the bill does: ticked members become going with their guests, unticked members who had a
 * seat are no-shows, other unticked "going" rows (waitlisted, lapsed holds) are dropped. Paid rows never change but still
 * count their seats. A seat limit the real party exceeds is raised to fit it.
 */
export function attendanceCheck(
  rows: { memberId: number; status: string | null; guests: number; paidAt: unknown; paidAmount?: number | null }[],
  confirmedIds: number[],
  attended: Attended[],
  capacity: number | null
) {
  const paid = rows.filter((r) => r.paidAt || (r.paidAmount ?? 0) > 0);
  const isPaid = new Set(paid.map((r) => r.memberId));
  const ticked = new Set(attended.map((a) => a.memberId));
  const going = attended.filter((a) => !isPaid.has(a.memberId));
  const left = rows.filter((r) => r.status === 'going' && !ticked.has(r.memberId) && !isPaid.has(r.memberId));
  const seats = [...going, ...paid.filter((r) => r.status === 'going')].reduce((n, r) => n + 1 + r.guests, 0);
  return {
    going,
    noShow: left.filter((r) => confirmedIds.includes(r.memberId)).map((r) => r.memberId),
    dropped: left.filter((r) => !confirmedIds.includes(r.memberId)).map((r) => r.memberId),
    seats,
    capacity: capacity === null ? null : Math.max(capacity, seats),
  };
}

/** Seats beyond the limit the event was planned with (raised by the attendance check), or 0. */
export const overLimit = (ev: { capacity: number | null; plannedCapacity: number | null }) =>
  ev.plannedCapacity !== null && ev.capacity !== null && ev.capacity > ev.plannedCapacity ? ev.capacity - ev.plannedCapacity : 0;

/** Roster members who have not answered yet (no day, no place picked, not declined), in roster order. */
export const pendingVoters = <M extends { id: number }>(roster: M[], responses: { memberId: number; days: unknown[]; venueIds: unknown[]; status?: string | null }[]) => {
  const voted = new Set(responses.filter((r) => r.days.length || r.venueIds.length || r.status === 'no').map((r) => r.memberId));
  return roster.filter((m) => !voted.has(m.id));
};

export type Reminder = {
  kind: 'poll' | 'rsvp' | 'bill';
  /** Participant names still to act: vote, answer RSVP, or pay. */
  names: string[];
  /** RSVP only: members whose seat is held and who must confirm it. */
  confirm: string[];
};

type RemindRow = { memberId: number; days: unknown[]; venueIds: unknown[]; status?: string | null; derived?: string | null; guests: number } & PayRow;

/**
 * Who to nudge at the current stage, for the organizer's reminder: poll = not voted, rsvp = not answered (`names`) or
 * holding a seat to confirm (`confirm`; `held` = member ids whose hold is still live), bill = confirmed attendees who still owe.
 * `roster` is the event's participants (people who joined it), not the whole team; archived members are skipped, order is roster order. Null once settled, or in the bill stage before there is a share. Carries no amounts, so a payment reminder can't leak them.
 */
export function reminderOf(
  stage: string,
  roster: { id: number; name: string; archivedAt?: unknown }[],
  responses: RemindRow[],
  confirmed: number[],
  share: number | null,
  held: number[]
): Reminder | null {
  const active = roster.filter((m) => !m.archivedAt);
  const row = (id: number) => responses.find((r) => r.memberId === id);
  const nameOf = (m: { name: string }) => m.name;
  if (stage === 'poll') return { kind: 'poll', names: pendingVoters(active, responses).map(nameOf), confirm: [] };
  if (stage === 'rsvp') {
    // A lapsed hold (reconfirm_by passed) is not in `held` any more: that member is simply someone to ask again.
    const holding = (id: number) => row(id)?.derived === 'reconfirm' && held.includes(id);
    return {
      kind: 'rsvp',
      names: active.filter((m) => !holding(m.id) && (!row(m.id)?.status || row(m.id)?.derived === 'reconfirm')).map(nameOf),
      confirm: active.filter((m) => holding(m.id)).map(nameOf),
    };
  }
  if (stage === 'bill') {
    // No share yet (bill not entered, or nobody seated): nobody owes anything, so there is nothing to remind.
    if (share === null) return null;
    const unpaid = (id: number) => !paymentOf(row(id), share * (1 + (row(id)?.guests ?? 0))).done;
    return { kind: 'bill', names: active.filter((m) => confirmed.includes(m.id) && unpaid(m.id)).map(nameOf), confirm: [] };
  }
  return null;
}

/**
 * The i18n `stage.*` key for an event's badge: a poll past its deadline reads "waiting for the date", not "voting",
 * and a started event still in the RSVP stage reads "awaiting the bill", not "confirmed".
 */
export const stageKey = (ev: { stage: string; voteDeadline?: string | Date | null; startsAt?: string | Date | null }, now = Date.now()) => {
  if (ev.stage === 'poll' && !votingOpen(ev, now)) return 'pollClosed';
  if (ev.stage === 'rsvp' && ev.startsAt && new Date(ev.startsAt).getTime() <= now) return 'awaitingBill';
  return ev.stage;
};

/**
 * Poll days for the organizer to compare: who can make each day, how many honorees can, ranked by voters, then by honorees
 * who can come, then earliest first. `tie` says what put the first day ahead of an equal-vote second: 'honorees', 'earlier', or null (no tie).
 */
export function compareDays(days: string[], responses: { memberId: number; days: string[] }[], honorees: number[] = []) {
  const ranked = days
    .map((day) => {
      const yes = responses.filter((r) => r.days.includes(day)).map((r) => r.memberId);
      return { day, n: yes.length, yes, honoreesIn: honorees.filter((h) => yes.includes(h)) };
    })
    .sort((a, b) => b.n - a.n || b.honoreesIn.length - a.honoreesIn.length || a.day.localeCompare(b.day));
  const [a, b] = ranked;
  let tie: 'honorees' | 'earlier' | null = null;
  if (a && b && a.n > 0 && a.n === b.n) tie = a.honoreesIn.length > b.honoreesIn.length ? 'honorees' : 'earlier';
  return { ranked, tie };
}
