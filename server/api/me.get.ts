/** The signed-in member, or null. */
export default defineEventHandler((event) => memberByToken(sessionToken(event)));
