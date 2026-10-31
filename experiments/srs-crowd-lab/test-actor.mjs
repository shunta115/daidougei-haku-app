import { authenticateHaku } from '../free-live/haku-auth.mjs';

export const TEST_SUPABASE_URL = 'https://aeqskxxykzapgaudbeqa.supabase.co/';

export function makeTestActorResolver({ publishableKey, fetcher = fetch } = {}) {
  if (!publishableKey || typeof publishableKey !== 'string') throw new Error('test_publishable_key_required');
  return req => authenticateHaku({
    authorization: req.headers.authorization,
    url: TEST_SUPABASE_URL,
    publishableKey,
    fetcher,
  });
}
