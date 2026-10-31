import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTestActorResolver, TEST_SUPABASE_URL } from './test-actor.mjs';

test('TEST Auth verifier rejects missing login and binds approved performer to Auth UUID', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const called = [];
  const resolver = makeTestActorResolver({
    publishableKey: 'public-test-key',
    fetcher: async (url, options) => {
      called.push(String(url));
      assert.equal(options.headers.Authorization, 'Bearer test-access-token');
      if (String(url).endsWith('/auth/v1/user')) return Response.json({ id, is_anonymous: false });
      if (String(url).includes('/profiles?')) return Response.json([{ id, role: 'performer', status: 'active' }]);
      if (String(url).includes('/performers?')) return Response.json([{ id, is_approved: true }]);
      throw Error('unexpected_request');
    },
  });
  await assert.rejects(resolver({ headers: {} }), /authentication_required/);
  const actor = await resolver({ headers: { authorization: 'Bearer test-access-token' } });
  assert.deepEqual(actor, { id, role: 'performer', active: true, approved: true });
  assert.equal(called.length, 3);
  assert.ok(called.every(url => url.startsWith(TEST_SUPABASE_URL)));
});

test('TEST Auth verifier rejects inactive or anonymous accounts', async () => {
  const resolver = makeTestActorResolver({ publishableKey: 'public-test-key', fetcher: async () => Response.json({
    id: '00000000-0000-4000-8000-000000000002', is_anonymous: true,
  }) });
  await assert.rejects(resolver({ headers: { authorization: 'Bearer test-access-token' } }), /registered_account_required/);
});

test('TEST Auth verifier refuses private performer publishing before QR creation', async () => {
  const id = '00000000-0000-4000-8000-000000000003';
  const resolver = makeTestActorResolver({ publishableKey: 'public-test-key', fetcher: async url => {
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id, is_anonymous: false });
    if (String(url).includes('/profiles?')) return Response.json([{ id, role: 'performer', status: 'active' }]);
    assert.ok(new URL(url).searchParams.get('select').includes('is_private_test'));
    return Response.json([{ id, is_approved: true, is_private_test: true }]);
  } });
  await assert.rejects(resolver({ headers: { authorization: 'Bearer test-access-token' } }), /private_live_not_supported/);
});
