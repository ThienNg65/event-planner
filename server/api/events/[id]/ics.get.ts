/** The event as an iCalendar file, for "Add to calendar". */
export default defineEventHandler(async (event) => {
  const ev = await findEvent(routeId(event));
  if (!ev.startsAt) fail(404, 'notFound');
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin;
  setHeader(event, 'content-type', 'text/calendar; charset=utf-8');
  setHeader(event, 'content-disposition', `attachment; filename="event-${ev.id}.ics"`);
  return icsOf({ ...ev, startsAt: ev.startsAt }, origin);
});
