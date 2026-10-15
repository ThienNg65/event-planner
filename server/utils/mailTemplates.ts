type Tr = (key: string, params?: Record<string, unknown>) => string;

export const MAIL_KINDS = ['verifyCode', 'recoverCode', 'emailChanged', 'pinReset', 'planSet', 'paymentRequested', 'paymentRecorded', 'cancelled'] as const;
export type MailTemplate = (typeof MAIL_KINDS)[number];

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c]!);

/**
 * Subject, plain text and simple html of one mail, from the `mail.<kind>.*` strings: `subject`, `body` (paragraphs split
 * by a blank line) and, for each of `params.link` / `params.link2` that is given, `action` / `action2` as its label.
 * `params.unsubscribe` adds a "stop these emails" link (`mail.stop`). `mail.footer` closes every mail.
 */
export function renderMail(tr: Tr, kind: MailTemplate, params: Record<string, unknown> = {}) {
  const links = (
    [
      ['link', `mail.${kind}.action`],
      ['link2', `mail.${kind}.action2`],
      ['unsubscribe', 'mail.stop'],
    ] as const
  ).flatMap(([param, label]) => (typeof params[param] === 'string' && params[param] ? [{ label: tr(label, params), url: params[param] as string }] : []));
  const paragraphs = tr(`mail.${kind}.body`, params).split(/\n\s*\n/);
  const footer = tr('mail.footer', params);
  return {
    subject: tr(`mail.${kind}.subject`, params),
    text: [...paragraphs, ...links.map((l) => `${l.label}: ${l.url}`), footer].join('\n\n'),
    html: [
      ...paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`),
      ...links.map((l) => `<p><a href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a></p>`),
      `<p style="color:#6b7280;font-size:12px">${escapeHtml(footer)}</p>`,
    ].join('\n'),
  };
}
