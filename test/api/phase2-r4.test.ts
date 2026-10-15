import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, cleanup, member, query, startServer, stopServer } from './harness.ts';

/**
 * Phase 2 R4: email ships switched off. The harness server has no GMAIL_USER, so every email endpoint must refuse and
 * the app must report that email is off. (The mailed-code flows need a sender and are covered by test/email.test.ts and the SQL checks.)
 */
before(startServer);
afterEach(cleanup);
after(stopServer);

describe('email is off without a Gmail account', () => {
  it('reports emailEnabled false to the signed-in member and to visitors, and returns no address', async () => {
    const me = await member();
    const mine = (await api('/api/me', { me })).body;
    assert.equal(mine.emailEnabled, false);
    assert.equal(mine.email, null);
    assert.deepEqual((await api('/api/email-enabled')).body, { enabled: false });
  });

  it('refuses every email endpoint with emailOff', async () => {
    const me = await member();
    const body = { email: 'a@example.com', consent: true, currentPin: '482916', code: '123456', newPin: '739406', token: 'x' };
    for (const [path, method] of [
      ['/api/me/email', 'POST'],
      ['/api/me/email/verify', 'POST'],
      ['/api/me/email/revert', 'POST'],
      ['/api/me/email', 'DELETE'],
      [`/api/members/${me}/recover`, 'POST'],
      [`/api/members/${me}/recover/confirm`, 'POST'],
    ] as const) {
      const res = await api(path, { method, me, body });
      assert.equal(res.status, 404, `${method} ${path}`);
      assert.equal(res.message, 'emailOff', `${method} ${path}`);
    }
    assert.equal((await query('SELECT count(*)::int AS n FROM member_codes WHERE member_id = $1', [me]))[0]!.n, 0);
  });
});
