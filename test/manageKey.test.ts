import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashMatches, sha256 } from '../server/utils/http.ts';

// POST /api/events/:id/key requires this proof of the current manage key, so a stolen sign-in link (host by creator) can't rotate it.
test('hashMatches accepts only the key whose hash is stored', () => {
  const stored = sha256('current-key');
  assert.equal(hashMatches('current-key', stored), true);
  assert.equal(hashMatches('other-key', stored), false);
  assert.equal(hashMatches('', stored), false);
  assert.equal(hashMatches('current-key', null), false);
});
