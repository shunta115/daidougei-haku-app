// TEST Supabase Auth verifier for the isolated loopback gateway.
// Do not expose this gateway or the SRS HTTP API to the internet.
import { makeCrowdHttpGateway } from './crowd-http.mjs';
import { openSqliteCrowdStore } from './state-store.mjs';
import { makeSrsCrowdGate } from './publish-gate.mjs';
import { openSrsWhip, closeSrsWhip } from './srs-loopback.mjs';
import { makeTestActorResolver } from './test-actor.mjs';

const publishableKey = process.env.HAKU_TEST_SUPABASE_PUBLISHABLE_KEY;
const resolveActor = makeTestActorResolver({ publishableKey });
const filename = process.env.HAKU_CROWD_STATE_FILE;
if (!filename) throw Error('HAKU_CROWD_STATE_FILE must point to a private persistent file');
const store = openSqliteCrowdStore(filename);
const gate = makeSrsCrowdGate({ store, openMedia: openSrsWhip, closeMedia: closeSrsWhip });
const { server } = makeCrowdHttpGateway({ resolveActor, gate });
server.on('close', () => store.close());
server.listen(4320, '127.0.0.1', () => {
  console.log('TEST Auth CROWD gateway ready on 127.0.0.1:4320');
});
