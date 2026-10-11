/** `host` holds the manage key, `cohost` the co-host key, null is a plain participant. */
export type Role = 'host' | 'cohost' | null;

/** The lowest role allowed to do each organizer action (one table for the API and the UI). */
const MIN_ROLE = {
  edit: 'cohost',
  advance: 'cohost',
  removeVenue: 'cohost',
  setOthers: 'cohost',
  reopen: 'host',
  cancel: 'host',
  delete: 'host',
  cohost: 'host',
} as const;

/** How long a pending co-host invite can still be accepted (an active co-host never expires). */
export const INVITE_TTL_MS = 7 * 24 * 3600_000;
/** Active + pending named co-hosts allowed per event. */
export const MAX_COHOSTS = 5;

export type Action = keyof typeof MIN_ROLE;

export const can = (role: Role, action: Action) => role === 'host' || (role === 'cohost' && MIN_ROLE[action] === 'cohost');
