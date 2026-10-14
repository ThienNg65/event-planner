import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reminderMessage, shareMessage, type Tr } from '../app/utils/messages.ts';

const LOCALES = Object.fromEntries(['vi', 'en'].map((l) => [l, JSON.parse(readFileSync(new URL(`../i18n/locales/${l}.json`, import.meta.url), 'utf8'))]));
const lookup = (lang: string): Tr => (key, params = {}) => {
  const raw = key.split('.').reduce((o, k) => o?.[k], LOCALES[lang]) as string | undefined;
  assert.ok(raw, `missing ${lang} key ${key}`);
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(params[k]));
};

const URL_ = 'https://x.test/e/7?s=poll';
const ev = { title: 'Tiệc', stage: 'poll', startsAt: null, voteDeadline: null, pollDays: ['2026-10-23'] };

test('share message: stage-aware, in the chosen language, with the link and a Vietnam-time date', () => {
  assert.match(shareMessage(lookup('vi'), 'vi', ev, URL_), /bình chọn.*\n?.*https:\/\/x\.test\/e\/7\?s=poll/s);
  assert.match(shareMessage(lookup('en'), 'en', ev, URL_), /Please vote/);
  const dl = shareMessage(lookup('en'), 'en', { ...ev, voteDeadline: '2099-10-23T12:00:00Z' }, URL_);
  assert.match(dl, /by .*07:00\sPM/);
  const rsvp = shareMessage(lookup('vi'), 'vi', { ...ev, stage: 'rsvp', startsAt: '2026-10-23T12:00:00Z' }, URL_);
  assert.match(rsvp, /19:00/);
  assert.match(shareMessage(lookup('en'), 'en', { ...ev, voteDeadline: '2000-01-01T00:00:00Z' }, URL_), /Voting is closed/);
  assert.match(shareMessage(lookup('en'), 'en', { ...ev, pollDays: [] }, URL_), /place/);
});

test('share message: a cancelled event says so, a started RSVP does not ask "are you coming?"', () => {
  for (const lang of ['vi', 'en']) {
    const cancelled = shareMessage(lookup(lang), lang, { ...ev, cancelledAt: '2026-10-01T00:00:00Z' }, URL_);
    assert.match(cancelled, lang === 'en' ? /cancelled/ : /huỷ/);
    assert.doesNotMatch(cancelled, /Please vote|bình chọn những/);
    const started = shareMessage(lookup(lang), lang, { ...ev, stage: 'rsvp', startsAt: '2000-01-01T12:00:00Z' }, URL_);
    assert.match(started, /https:\/\/x\.test/);
    assert.doesNotMatch(started, /Are you coming|có tham gia không/);
  }
});

test('every message key exists in both languages for every stage', () => {
  for (const lang of ['vi', 'en']) {
    for (const stage of ['poll', 'rsvp', 'bill', 'settled']) shareMessage(lookup(lang), lang, { ...ev, stage, startsAt: '2026-10-23T12:00:00Z' }, URL_);
    reminderMessage(lookup(lang), lang, ev, { kind: 'rsvp', names: ['A'], confirm: ['B'] }, URL_, false);
  }
});

test('reminders: names, confirm line, count-only, and never an amount', () => {
  const poll = reminderMessage(lookup('en'), 'en', ev, { kind: 'poll', names: ['An', 'Bình'], confirm: [] }, URL_, false);
  assert.match(poll, /An, Bình/);
  const rsvp = reminderMessage(lookup('en'), 'en', { ...ev, stage: 'rsvp' }, { kind: 'rsvp', names: ['An'], confirm: ['Bình'] }, URL_, false);
  assert.match(rsvp, /Not answered yet: An\./);
  assert.match(rsvp, /confirm your seat: Bình\./);
  const bill = { kind: 'bill', names: ['An', 'Bình'], confirm: [] } as const;
  const named = reminderMessage(lookup('vi'), 'vi', { ...ev, stage: 'bill' }, bill, URL_, false);
  assert.match(named, /An, Bình/);
  const count = reminderMessage(lookup('vi'), 'vi', { ...ev, stage: 'bill' }, bill, URL_, true);
  assert.match(count, /Còn 2 người/);
  assert.doesNotMatch(count, /An|Bình|₫|\d{4,}/);
});
