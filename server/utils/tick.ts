// Hourly scheduler entry. Jobs (notification sweep, "tomorrow" mails, payment reminders) register here.
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const VN_OFFSET = 7 * HOUR;
/** Scheduled mails ("tomorrow", payment reminders) are queued from 09:00 to 20:59 Vietnam time, the 02:00–13:59 UTC hours. The first tick
 * in the window queues them; later ticks find them already queued (the outbox dedupes on the fact), so a missed 09:00 tick only delays them. */
const SENDING_UTC_HOURS = [2, 14];
/** Days after the payment request when reminder 1 and reminder 2 become due. */
const REMINDER_AFTER_DAYS = [2, 5];

export type TickJob = { name: string; run: (now: Date) => Promise<unknown> };

export type TickSummary = { at: string; jobs: { name: string; ok: boolean; error?: string }[] };

const jobs: TickJob[] = [];

export function registerTickJob(name: string, run: TickJob['run']) {
  jobs.push({ name, run });
}

/** Runs every job; a failing job is reported in the summary and never stops the others. */
export async function runTick(now: Date, list: TickJob[] = jobs): Promise<TickSummary> {
  const results: TickSummary['jobs'] = [];
  for (const job of list) {
    try {
      await job.run(now);
      results.push({ name: job.name, ok: true });
    } catch (e) {
      console.error(`[tick] ${job.name} failed`, e);
      results.push({ name: job.name, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { at: now.toISOString(), jobs: results };
}

export function isSendingHour(now: Date) {
  const h = now.getUTCHours();
  return h >= SENDING_UTC_HOURS[0]! && h < SENDING_UTC_HOURS[1]!;
}

/** Start (inclusive) and end (exclusive) of tomorrow's calendar day in Vietnam time. */
export function tomorrowWindowVN(now: Date) {
  const vn = new Date(now.getTime() + VN_OFFSET);
  const start = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + 1) - VN_OFFSET);
  return { start, end: new Date(start.getTime() + DAY) };
}

/** Which payment reminder (1 or 2) is due, given how many were already sent; at most 2 ever. */
export function reminderDue(requestedAt: Date, now: Date, sent: number): 1 | 2 | null {
  if (sent < 0 || sent >= REMINDER_AFTER_DAYS.length) return null;
  const due = requestedAt.getTime() + REMINDER_AFTER_DAYS[sent]! * DAY <= now.getTime();
  return due ? ((sent + 1) as 1 | 2) : null;
}
