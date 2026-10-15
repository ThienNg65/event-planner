/**
 * The link in every notification mail. Opening it changes nothing (mail scanners follow links): the page asks to confirm,
 * and the button POSTs to the same address.
 */
export default defineEventHandler((event) => {
  const { secret } = requireEmailEnabled();
  const q = getQuery(event);
  const target = unsubscribeTarget(secret, q.t);
  if (!target) fail(400, 'unsubscribeInvalid');
  return unsubscribePage(event, mailLocale(q.l), target.kind, { action: `/api/unsubscribe?t=${encodeURIComponent(String(q.t))}&l=${mailLocale(q.l)}` });
});
