/** Signs this browser in from a sign-in link opened on another device. */
export default defineEventHandler(async (event) => {
  const token = clean((await readJson(event)).token, 100);
  const m = await memberByToken(token || null);
  if (!m) fail(404, 'signInInvalid');
  setSession(event, token);
  return m;
});
