/** This browser's sign-in token, so the member can open their sign-in link on another device. */
export default defineEventHandler(async (event) => {
  if ((await meOf(event)) === null) fail(401, 'signInFirst');
  return { token: sessionToken(event)! };
});
