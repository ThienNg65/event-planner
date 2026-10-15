/**
 * Mutes the notification kind a signed link names, for its member. Also the one-click target of the `List-Unsubscribe-Post`
 * header, so it needs no cookie: the token in the address is the proof. Answers the same page whether or not anything changed.
 */
export default defineEventHandler(async (event) => {
  const { secret } = requireEmailEnabled();
  const q = getQuery(event);
  const target = unsubscribeTarget(secret, q.t);
  if (!target) fail(400, 'unsubscribeInvalid');
  await setMuted(target.memberId, target.kind, true);
  return unsubscribePage(event, mailLocale(q.l), target.kind);
});
