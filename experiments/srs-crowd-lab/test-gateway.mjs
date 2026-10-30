// TEST Supabase Auth verifier for the isolated loopback gateway.
// Do not expose this gateway or the SRS HTTP API to the internet.
import { makeCrowdHttpGateway } from './crowd-http.mjs';
import { makeTestActorResolver } from './test-actor.mjs';

const publishableKey = process.env.HAKU_TEST_SUPABASE_PUBLISHABLE_KEY;
const resolveActor = makeTestActorResolver({ publishableKey });
const { server } = makeCrowdHttpGateway({ resolveActor });
server.listen(4320, '127.0.0.1', () => {
  console.log('TEST Auth CROWD gateway ready on 127.0.0.1:4320');
});
