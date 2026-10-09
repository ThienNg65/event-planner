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

/** The visitor's own state on one event, as the home list and the event page both need it. */
export type Mine = { voted: boolean; status: string | null; waitlisted: boolean; owes: number | null; paid: boolean };

type MyRow = { days: string[]; venueIds: number[]; status: string | null; guests: number; paidAt: unknown };

/** `row` is the member's response (absent if they never answered); only confirmed attendees owe a share. */
export const mineOf = (row: MyRow | undefined, confirmed: boolean, waitlisted: boolean, share: number | null): Mine => ({
  voted: !!row && (row.days.length > 0 || row.venueIds.length > 0),
  status: row?.status ?? null,
  waitlisted,
  owes: confirmed && share !== null ? share * (1 + row!.guests) : null,
  paid: !!row?.paidAt,
});

export type Step = 'vote' | 'voted' | 'rsvp' | 'going' | 'waitlist' | 'replied' | 'pay' | 'paid' | 'done' | 'settled';
export type OrganizerAction = 'lock' | 'bill' | 'settle';

/**
 * What the visitor should do next, and the organizer's next move (null when not managing or nothing is due).
 * `started`: the event's date has passed, so RSVP no longer matters and the bill can be entered.
 */
export function nextStep(o: { stage: string; mine: Mine | null; manager: boolean; allPaid: boolean; started: boolean }) {
  const { stage, mine, manager, allPaid, started } = o;
  let step: Step = 'done';
  if (stage === 'poll') step = mine?.voted ? 'voted' : 'vote';
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
