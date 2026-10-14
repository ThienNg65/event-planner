import { stageKey, votingOpen, type Reminder } from '../../shared/utils/event.ts';
import { fmtDateTime } from './format.ts';

/** Translates with an explicit message language, so a copied text follows the toggle, not the app's language. */
export type Tr = (key: string, params?: Record<string, unknown>) => string;

type MsgEvent = { title: string; stage: string; startsAt: string | null; voteDeadline: string | null; pollDays: string[]; cancelledAt?: string | null };

/** The Zalo-ready invitation for the event's current stage. `url` is the joining link plus `?s=<stage>`, and never a manage key. */
export function shareMessage(tr: Tr, lang: string, ev: MsgEvent, url: string) {
  const when = ev.startsAt ? fmtDateTime(ev.startsAt, lang) : '';
  const base = { title: ev.title, when, url };
  if (ev.cancelledAt) return tr('msg.share.cancelled', base);
  if (ev.stage === 'poll') {
    if (!votingOpen(ev)) return tr('msg.share.pollClosed', base);
    const what = ev.pollDays.length ? 'pollDays' : 'pollVenue';
    if (ev.voteDeadline) return tr(`msg.share.${what}By`, { ...base, deadline: fmtDateTime(ev.voteDeadline, lang) });
    return tr(`msg.share.${what}`, base);
  }
  if (ev.stage === 'rsvp') return tr(stageKey(ev) === 'awaitingBill' ? 'msg.share.rsvpStarted' : 'msg.share.rsvp', base);
  return tr(`msg.share.${ev.stage}`, base);
}

/** The reminder text for the people still to act. A bill reminder lists names or only a count, and never an amount. */
export function reminderMessage(tr: Tr, lang: string, ev: MsgEvent, r: Reminder, url: string, countOnly: boolean) {
  const base = { title: ev.title, url };
  const lines: string[] = [];
  if (r.kind === 'poll') {
    const by = ev.voteDeadline ? tr('msg.remind.by', { deadline: fmtDateTime(ev.voteDeadline, lang) }) : '';
    lines.push(tr('msg.remind.poll', { ...base, names: r.names.join(', '), by }));
  } else if (r.kind === 'rsvp') {
    lines.push(tr('msg.remind.rsvpHead', base));
    if (r.names.length) lines.push(tr('msg.remind.rsvp', { names: r.names.join(', ') }));
    if (r.confirm.length) lines.push(tr('msg.remind.rsvpConfirm', { names: r.confirm.join(', ') }));
    lines.push(url);
  } else {
    lines.push(countOnly ? tr('msg.remind.billCount', { ...base, n: r.names.length }) : tr('msg.remind.bill', { ...base, names: r.names.join(', ') }));
  }
  return lines.join('\n');
}
