/** Who a pending invite is for, so the page can greet the right person. POST, so the secret never sits in a URL. */
export default defineEventHandler(async (event) => {
  const row = await inviteRow(routeId(event), await readJson(event));
  return { memberId: row.memberId, name: row.name, status: row.expired ? 'expired' : 'valid' };
});
