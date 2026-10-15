type Tr = (key: string, params?: Record<string, unknown>) => string;

export const MAIL_KINDS = ['verifyCode', 'recoverCode', 'emailChanged', 'pinReset'] as const;
export type MailTemplate = (typeof MAIL_KINDS)[number];

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c]!);

/**
 * Subject, plain text and simple html of one mail, from the `mail.<kind>.*` strings: `subject`, `body` (paragraphs split
 * by a blank line) and, when `params.link` is given, `action` as the link's label. `mail.footer` closes every mail.
 */
export function renderMail(tr: Tr, kind: MailTemplate, params: Record<string, unknown> = {}) {
  const link = typeof params.link === 'string' ? params.link : '';
  const paragraphs = tr(`mail.${kind}.body`, params).split(/\n\s*\n/);
  const footer = tr('mail.footer', params);
  const action = link ? tr(`mail.${kind}.action`, params) : '';
  return {
    subject: tr(`mail.${kind}.subject`, params),
    text: [...paragraphs, ...(link ? [`${action}: ${link}`] : []), footer].join('\n\n'),
    html: [
      ...paragraphs.map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`),
      ...(link ? [`<p><a href="${esc(link)}">${esc(action)}</a></p>`] : []),
      `<p style="color:#6b7280;font-size:12px">${esc(footer)}</p>`,
    ].join('\n'),
  };
}
