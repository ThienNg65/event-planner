import { STAGES } from '../db/schema';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const BANK_ID = /^[A-Za-z0-9]{2,20}$/;
const BANK_ACCOUNT = /^[A-Za-z0-9]{1,19}$/;

type EventFields = Partial<typeof schema.events.$inferInsert>;

/** Validates the event fields present in `b` (create and update share this); absent fields are left out. */
export function eventFields(b: Record<string, unknown>) {
  const out: EventFields = {};
  if ('title' in b) {
    out.title = clean(b.title, 100);
    if (!out.title) fail(400, 'titleRequired');
  }
  if ('note' in b) out.note = clean(b.note, 500);
  if ('stage' in b) {
    if (!STAGES.includes(b.stage as never)) fail(400, 'invalid');
    out.stage = b.stage as EventFields['stage'];
  }
  if ('pollDays' in b) {
    const days = b.pollDays;
    const valid = (d: unknown) => typeof d === 'string' && DAY.test(d) && !Number.isNaN(Date.parse(d));
    if (!Array.isArray(days) || days.length > 20 || !days.every(valid)) fail(400, 'invalidDays');
    out.pollDays = [...new Set(days as string[])].sort();
  }
  if ('startsAt' in b) {
    const d = new Date(String(b.startsAt));
    if (b.startsAt !== null && (typeof b.startsAt !== 'string' || Number.isNaN(d.getTime()))) fail(400, 'invalidDate');
    out.startsAt = b.startsAt === null ? null : d;
  }
  if ('venue' in b) out.venue = clean(b.venue, 100) || null;
  if ('venueLink' in b) {
    const link = clean(b.venueLink, 500);
    if (link && !isHttpUrl(link)) fail(400, 'invalidLink');
    out.venueLink = link || null;
  }
  if ('capacity' in b) {
    if (b.capacity !== null && !intIn(b.capacity, 1, 500)) fail(400, 'invalidCapacity');
    out.capacity = b.capacity as number | null;
  }
  if ('billTotal' in b) {
    if (b.billTotal !== null && !intIn(b.billTotal, 0, 1_000_000_000)) fail(400, 'invalidBill');
    out.billTotal = b.billTotal as number | null;
  }
  if ('bankId' in b) {
    const v = clean(b.bankId, 100);
    if (v && !BANK_ID.test(v)) fail(400, 'invalidBank');
    out.bankId = v || null;
  }
  if ('bankAccount' in b) {
    const v = clean(b.bankAccount, 100);
    if (v && !BANK_ACCOUNT.test(v)) fail(400, 'invalidBank');
    out.bankAccount = v || null;
  }
  if ('bankHolder' in b) out.bankHolder = clean(b.bankHolder, 50) || null;
  if ('cover' in b) {
    const v = clean(b.cover, 500);
    if (v && !isCoverKey(v) && !isHttpUrl(v)) fail(400, 'invalidCover');
    out.cover = v || null;
  }
  return out;
}
