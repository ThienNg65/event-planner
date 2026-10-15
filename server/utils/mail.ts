import { sql } from 'drizzle-orm';
import { createTransport, type Transporter } from 'nodemailer';
import en from '../../i18n/locales/en.json';
import vi from '../../i18n/locales/vi.json';

export type EmailMessage = { to: string; subject: string; text: string; html: string; headers?: Record<string, string> };
export interface EmailSender {
  send(messages: EmailMessage[]): Promise<void>;
}

let transport: Transporter | undefined;

/**
 * Sends through a Gmail account over SMTP, signed in with an app password (Google account → Security → App passwords;
 * needs 2-step verification). Gmail allows about 500 mails a day from a personal account. SMTP needs a TCP socket, so this
 * runs on Node hosts (Vercel, Netlify), not on Cloudflare Workers.
 */
class GmailSender implements EmailSender {
  constructor(private user: string, private password: string, private name: string) {}
  async send(messages: EmailMessage[]) {
    transport ??= createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: this.user, pass: this.password } });
    for (const { to, subject, text, html, headers } of messages)
      await transport.sendMail({ from: { name: this.name, address: this.user }, to, subject, text, html, headers });
  }
}

/** Used without a Gmail account (local dev): the mail goes to the server log. */
class LogSender implements EmailSender {
  async send(messages: EmailMessage[]) {
    for (const m of messages) console.info(`[mail] to ${m.to}: ${m.subject}\n${m.text}`);
  }
}

/** Settings come from runtimeConfig (NUXT_* variables) or, like DATABASE_URL, from the plain variable of the same name. */
function config() {
  const rc = useRuntimeConfig();
  const pick = (value: unknown, name: string) => String(value || process.env[name] || '').trim();
  return {
    gmailUser: pick(rc.gmailUser, 'GMAIL_USER'),
    // Google shows app passwords in groups of four; the spaces are not part of it.
    gmailPassword: pick(rc.gmailAppPassword, 'GMAIL_APP_PASSWORD').replace(/\s+/g, ''),
    fromName: pick(rc.mailFromName, 'MAIL_FROM_NAME') || 'Team Events',
    appUrl: pick(rc.appUrl, 'APP_URL').replace(/\/+$/, '') || (import.meta.dev ? 'http://localhost:3000' : ''),
    secret: pick(rc.notifySecret, 'NOTIFY_SECRET'),
    domains: parseDomains(pick(rc.allowedEmailDomains, 'ALLOWED_EMAIL_DOMAINS')),
  };
}

/**
 * Email is off (and its UI hidden) until a Gmail account is configured. Local dev needs only the secret: mail then goes to the log.
 * The site address and secret are always required, so a link in a mail can't be pointed at a forged host.
 */
export function emailEnabled() {
  const c = config();
  return !!c.secret && !!c.appUrl && (import.meta.dev || (!!c.gmailUser && !!c.gmailPassword));
}

export function requireEmailEnabled() {
  if (!emailEnabled()) fail(404, 'emailOff');
  return config();
}

const LOCALES = { vi, en } as const;
export const mailTranslator = (locale: string) => (key: string, params: Record<string, unknown> = {}) => {
  const raw = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], LOCALES[locale === 'en' ? 'en' : 'vi']);
  return typeof raw === 'string' ? raw.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? '')) : key;
};

/** Mails sent in the last 24 h, from `mail_log`. */
export async function mailsSentToday() {
  const { rows } = await useDb().execute<{ n: number }>(sql`select count(*)::int as n from mail_log where sent_at > now() - interval '24 hours'`);
  return rows[0]!.n;
}

/**
 * Takes one place in the daily budget, atomically, so parallel sends can't pass the limit together. False when the budget
 * is used up. Old log rows are dropped on the way.
 */
async function reserveMail(kind: MailKind) {
  const { rows } = await useDb().execute(sql`
    with old as (delete from mail_log where sent_at < now() - interval '2 days')
    insert into mail_log (kind)
    select ${kind}::text where (select count(*) from mail_log where sent_at > now() - interval '24 hours') < ${mailLimit(kind)}::int
    returning id`);
  return rows.length > 0;
}

type Mail = { kind: MailKind; to: string; template: MailTemplate; locale: string; params?: Record<string, unknown>; headers?: Record<string, string> };

/** Reserves budget and sends one templated mail. 429 `mailBudget` when the day's budget is used up, 502 `mailFailed` when the provider refuses. */
export async function sendMail({ kind, to, template, locale, params = {}, headers }: Mail) {
  const c = requireEmailEnabled();
  if (!(await reserveMail(kind))) fail(429, 'mailBudget');
  const sender = c.gmailUser && c.gmailPassword ? new GmailSender(c.gmailUser, c.gmailPassword, c.fromName) : new LogSender();
  try {
    await sender.send([{ to, ...renderMail(mailTranslator(locale), template, params), ...(headers && { headers }) }]);
  } catch (e) {
    console.error('[mail] send failed', e);
    fail(502, 'mailFailed');
  }
}

/** Like `sendMail` for notices that must not fail the request they follow. */
export const trySendMail = (mail: Mail) => sendMail(mail).catch(() => undefined);

/** Site address and secret, for code that builds links in mails. */
export const mailConfig = config;

export const mailLocale = (v: unknown): 'vi' | 'en' => (v === 'en' ? 'en' : 'vi');
