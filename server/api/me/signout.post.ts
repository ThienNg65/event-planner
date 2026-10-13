export default defineEventHandler((event) => {
  clearSession(event);
  return null;
});
