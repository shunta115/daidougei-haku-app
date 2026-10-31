import { authenticateHaku } from '../free-live/haku-auth.mjs';

export const TEST_SUPABASE_URL = 'https://aeqskxxykzapgaudbeqa.supabase.co/';

export function makeTestActorResolver({ publishableKey, fetcher = fetch } = {}) {
  if (!publishableKey || typeof publishableKey !== 'string') throw new Error('test_publishable_key_required');
  return async req => {
    let privateTest = false;
    const guardedFetch = async (input, options) => {
      const url = new URL(input);
      if (url.pathname === '/rest/v1/performers') url.searchParams.set('select', 'id,is_approved,is_private_test');
      const response = await fetcher(url, options);
      if (url.pathname === '/rest/v1/performers' && response.ok) privateTest = (await response.clone().json())[0]?.is_private_test === true;
      return response;
    };
    const actor = await authenticateHaku({
      authorization: req.headers.authorization,
      url: TEST_SUPABASE_URL,
      publishableKey,
      fetcher: guardedFetch,
    });
    if (privateTest) throw Error('private_live_not_supported');
    return actor;
  };
}
