/** Whether the app can send email, for screens shown before anyone signs in (the PIN recovery link). */
export default defineEventHandler(() => ({ enabled: emailEnabled() }));
