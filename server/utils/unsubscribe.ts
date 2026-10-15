import { sql } from 'drizzle-orm';
import type { H3Event } from 'h3';

/** The member and kind a signed unsubscribe link (`unsubscribeUrl`) names, or null when the link is forged or malformed. */
export function unsubscribeTarget(secret: string, token: unknown) {
  const [, id, kind] = verifyToken(secret, token)?.match(/^unsub:(\d+):(\w+)$/) ?? [];
  return id && isNotifyKind(kind) ? { memberId: Number(id), kind } : null;
}

/** Mutes (or unmutes) one kind of notification mail for a member; muting twice changes nothing. */
export const setMuted = (memberId: number, kind: NotifyKind, muted: boolean) =>
  useDb().execute(
    muted
      ? sql`update member_email set muted_kinds = array_append(muted_kinds, ${kind}::text) where member_id = ${memberId}::int and not (${kind}::text = any(muted_kinds))`
      : sql`update member_email set muted_kinds = array_remove(muted_kinds, ${kind}::text) where member_id = ${memberId}::int`
  );

/** A small self-contained page for the unsubscribe link; `button` adds the form that confirms (POST to the same address). */
export function unsubscribePage(event: H3Event, locale: string, kind: NotifyKind, button?: { action: string }) {
  const tr = mailTranslator(locale);
  const done = !button;
  setResponseHeaders(event, {
    'content-type': 'text/html; charset=utf-8',
    // The address carries the signed token: keep it out of referrers, and allow nothing but this page's own form.
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
  });
  const what = tr(`mail.kinds.${kind}`);
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(tr('mail.unsubscribe.title'))}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1rem;line-height:1.5">
<h1 style="font-size:1.25rem">${escapeHtml(tr('mail.unsubscribe.title'))}</h1>
<p>${escapeHtml(tr(done ? 'mail.unsubscribe.done' : 'mail.unsubscribe.body', { what }))}</p>
${button ? `<form method="post" action="${escapeHtml(button.action)}"><button type="submit" style="font:inherit;padding:.5rem 1rem">${escapeHtml(tr('mail.unsubscribe.button'))}</button></form>` : ''}
</body></html>`;
}
