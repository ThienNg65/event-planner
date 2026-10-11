import { eq, sql } from 'drizzle-orm';
import { STAGES } from '../../db/schema';

export default defineEventHandler(async (event) => {
  const { events, responses } = schema;
  const ev = await findEvent(routeId(event));
  const role = roleOf(event, ev);
  requireCan(role, 'edit');
  const b = await readJson(event);

  // Cancel and restore are host-only and exclusive: Cancelled is an overlay, so restoring keeps the stage.
  if (b.restore === true || 'cancel' in b) {
    requireCan(role, 'cancel');
    const set = b.restore === true ? { cancelledAt: null, cancelReason: null } : { cancelledAt: new Date(), cancelReason: clean(b.cancel, 200) || null };
    await useDb().update(events).set(set).where(eq(events.id, ev.id));
    return { ok: true };
  }
  if (ev.cancelledAt) fail(409, 'cancelled');

  const f = eventFields(b);
  if (!Object.keys(f).length) fail(400, 'invalid');
  if (f.stage && f.stage !== ev.stage) requireCan(role, STAGES.indexOf(f.stage) > STAGES.indexOf(ev.stage) ? 'advance' : 'reopen');
  // The form resends an unchanged deadline on every save; only a changed one has to lie in the future.
  if (f.voteDeadline && f.voteDeadline.getTime() !== ev.voteDeadline?.getTime() && f.voteDeadline.getTime() < Date.now()) fail(400, 'invalidDate');
  const set = { ...f, ...('notice' in f && f.notice !== ev.notice && { noticeAt: f.notice ? new Date() : null }) };
  // Past the poll stage the event needs a fixed date (that's what "Lock" sets).
  const next = { ...ev, ...f };
  if (next.stage !== 'poll' && !next.startsAt) fail(400, 'invalidDate');

  const update = useDb().update(events).set(set).where(eq(events.id, ev.id));
  if (!f.pollDays) {
    await update;
    return { ok: true };
  }
  // Drop votes for removed days in the same batch, or a member's next vote would be rejected as invalidDays.
  const keep = f.pollDays.length
    ? sql`ARRAY(SELECT d FROM unnest(${responses.days}) AS d WHERE d::text IN (${sql.join(f.pollDays.map((d) => sql`${d}`), sql`, `)}))`
    : sql`'{}'::date[]`;
  await useDb().batch([update, useDb().update(responses).set({ days: keep }).where(eq(responses.eventId, ev.id))]);
  return { ok: true };
});
