/**
 * The event as an iCalendar file, for "Add to calendar". It reads the event, so it needs the same access as the page: an
 * organizer, a participant, or the joining key (`?j=`, because a plain download link can't send the `x-join-key` header).
 */
export default defineEventHandler(async (event) => {
  const ev = await findEvent(routeId(event));
  if (!sameKey(getQuery(event).j, ev.joinKey)) await requireAccess(event, ev, await roleOf(event, ev));
  if (!ev.startsAt) fail(404, 'notFound');
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin;
  setHeader(event, 'content-type', 'text/calendar; charset=utf-8');
  setHeader(event, 'content-disposition', `attachment; filename="event-${ev.id}.ics"`);
  return icsOf({ ...ev, startsAt: ev.startsAt }, origin);
});
