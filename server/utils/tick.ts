// Hourly scheduler entry. Jobs (notification sweep, "tomorrow" mails, payment reminders) register here.
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const VN_OFFSET = 7 * HOUR;
/** Payment reminders go out at 09:00 Vietnam time, the 02:00 UTC hour. */
const REMINDER_UTC_HOUR = 2;
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

export function isReminderHour(now: Date) {
  return now.getUTCHours() === REMINDER_UTC_HOUR;
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
