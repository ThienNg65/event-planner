import { test } from 'node:test';
import assert from 'node:assert/strict';
import { domainAllowed, mailAllowed, mailLimit, normalizeEmail, parseDomains, previousAddress } from '../shared/utils/email.ts';
import { hashCode, newCode, sameHash, signToken, verifyToken } from '../server/utils/mailCrypto.ts';
import { readFileSync } from 'node:fs';
import { MAIL_KINDS, renderMail } from '../server/utils/mailTemplates.ts';

test('email address: trimmed, lower-cased, one plausible address only', () => {
  assert.equal(normalizeEmail('  Tu.Le@Example.COM '), 'tu.le@example.com');
  for (const bad of ['', 'a', 'a@b', 'a b@c.vn', 'a@b.c', 'a@b.vn, c@d.vn', '<a@b.vn>', 'a@@b.vn', 42, null, `${'x'.repeat(250)}@b.vn`]) assert.equal(normalizeEmail(bad), null, String(bad));
});

test('domain allowlist: empty allows any, otherwise an exact domain match', () => {
  assert.deepEqual(parseDomains(' Axon.vn, @axonactive.com ,,'), ['axon.vn', 'axonactive.com']);
  assert.deepEqual(parseDomains(undefined), []);
  assert.equal(domainAllowed('a@anything.org', []), true);
  const list = parseDomains('axon.vn');
  assert.equal(domainAllowed('a@axon.vn', list), true);
  assert.equal(domainAllowed('a@evil.axon.vn', list), false);
  assert.equal(domainAllowed('a@axon.vn.evil.com', list), false);
  assert.equal(domainAllowed('a@gmail.com', list), false);
});

test('mail budget: codes may use 95 a day, notifications only 70', () => {
  assert.equal(mailLimit('code'), 95);
  assert.equal(mailLimit('notice'), 95);
  assert.equal(mailLimit('notify'), 70);
  assert.equal(mailAllowed(94, 'code'), true);
  assert.equal(mailAllowed(95, 'code'), false);
  assert.equal(mailAllowed(69, 'notify'), true);
  assert.equal(mailAllowed(70, 'notify'), false);
});

test('previous address: a change keeps the old one, a second change inside the cool-down keeps the first', () => {
  const now = new Date('2026-10-15T00:00:00Z');
  const later = new Date(now.getTime() + 3_600_000);
  const past = new Date(now.getTime() - 3_600_000);
  assert.equal(previousAddress(undefined, 'a@x.vn', now), null);
  assert.equal(previousAddress({ email: 'a@x.vn', prevEmail: null, prevUntil: null }, 'a@x.vn', now), null);
  assert.equal(previousAddress({ email: 'a@x.vn', prevEmail: null, prevUntil: null }, 'b@x.vn', now), 'a@x.vn');
  assert.equal(previousAddress({ email: 'b@x.vn', prevEmail: 'a@x.vn', prevUntil: later }, 'c@x.vn', now), 'a@x.vn');
  assert.equal(previousAddress({ email: 'b@x.vn', prevEmail: 'a@x.vn', prevUntil: past }, 'c@x.vn', now), 'b@x.vn');
});

test('codes: six digits, hashed per member and purpose, compared in constant time', () => {
  for (let i = 0; i < 50; i++) assert.match(newCode(), /^\d{6}$/);
  const h = hashCode('s', 7, 'recover', '123456');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.ok(sameHash(h, hashCode('s', 7, 'recover', '123456')));
  assert.ok(!sameHash(h, hashCode('s', 7, 'recover', '123457')));
  assert.ok(!sameHash(h, hashCode('s', 8, 'recover', '123456')), 'bound to the member');
  assert.ok(!sameHash(h, hashCode('s', 7, 'verify', '123456')), 'bound to the purpose');
  assert.ok(!sameHash(h, hashCode('t', 7, 'recover', '123456')), 'bound to the secret');
  assert.ok(!sameHash(h, 'zz'));
});

test('signed tokens: verify with the same secret only, any tampering fails', () => {
  const token = signToken('secret', 'revert:7:1760000000000');
  assert.equal(verifyToken('secret', token), 'revert:7:1760000000000');
  assert.equal(verifyToken('other', token), null);
  const [body, sig] = token.split('.');
  const forged = `${Buffer.from('revert:8:1760000000000').toString('base64url')}.${sig}`;
  assert.equal(verifyToken('secret', forged), null);
  for (const bad of ['', 'x', `${body}.`, `.${sig}`, `${token}.x`, undefined, 5, `${body}.zz`]) assert.equal(verifyToken('secret', bad), null, String(bad));
});

test('mail templates: escape the html part, carry the link and code in both parts', () => {
  const tr = (key: string, p: Record<string, unknown> = {}) => `${key}|${Object.values(p).join('|')}`;
  const m = renderMail(tr, 'emailChanged', { name: '<b>Tu</b>', email: 'a@x.vn', link: 'https://x.test/email/revert#t=abc' });
  assert.match(m.subject, /^mail\.emailChanged\.subject/);
  assert.match(m.text, /https:\/\/x\.test\/email\/revert#t=abc/);
  assert.match(m.html, /href="https:\/\/x\.test\/email\/revert#t=abc"/);
  assert.doesNotMatch(m.html, /<b>Tu/);
  assert.match(m.html, /&lt;b&gt;Tu/);
});

test('every mail template and email error code exists in both languages', () => {
  for (const lang of ['vi', 'en']) {
    const d = JSON.parse(readFileSync(new URL(`../i18n/locales/${lang}.json`, import.meta.url), 'utf8'));
    for (const kind of MAIL_KINDS) {
      assert.ok(d.mail[kind].subject && d.mail[kind].body, `${lang} mail.${kind}`);
      const m = renderMail((k, p = {}) => k.split('.').reduce((o, x) => o?.[x], d).replace(/\{(\w+)\}/g, (_, n) => String(p[n])), kind, { code: '123456', email: 'a@x.vn', name: 'T', title: 'T', when: 'W', place: 'P', amount: '1', ...(kind === 'emailChanged' && { link: 'https://x.test/l' }) });
      assert.ok(!m.text.includes('undefined'), `${lang} ${kind}`);
      if (kind === 'verifyCode' || kind === 'recoverCode') assert.ok(m.text.includes('123456'));
      if (kind === 'emailChanged') assert.ok(m.text.includes('https://x.test/l') && m.text.includes('a@x.vn'));
    }
    assert.ok(d.mail.footer && d.mail.emailChanged.action);
    for (const code of ['emailOff', 'consentRequired', 'emailInvalid', 'emailDomain', 'pinRequired', 'emailSame', 'emailTooSoon', 'mailBudget', 'mailFailed', 'codeInvalid', 'revertInvalid']) {
      assert.ok(d.err[code], `${lang} err.${code}`);
    }
  }
});
