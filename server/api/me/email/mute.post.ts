/** Turns one kind of notification mail off or on for the signed-in member (the profile's switches). */
export default defineEventHandler(async (event) => {
  requireEmailEnabled();
  const me = await meOf(event);
  if (me === null) fail(401, 'signInFirst');
  const b = await readJson(event);
  if (!isNotifyKind(b.kind) || typeof b.muted !== 'boolean') fail(400, 'invalid');
  await setMuted(me, b.kind, b.muted);
  return { ok: true };
});
