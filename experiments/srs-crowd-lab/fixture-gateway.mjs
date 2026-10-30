// GitHub Actions fixture only. Never bind beyond 127.0.0.1.
import { makeCrowdHttpGateway } from './crowd-http.mjs';

const actors = {
  owner: { id: '00000000-0000-4000-8000-000000000001', role: 'performer', approved: true, active: true },
  camera: { id: '00000000-0000-4000-8000-000000000002', role: 'fan', approved: false, active: true },
};
const { server } = makeCrowdHttpGateway({
  resolveActor: req => actors[String(req.headers.authorization || '').replace(/^Bearer /, '')] || null,
});
server.listen(4320, '127.0.0.1', () => console.log('CROWD fixture gateway ready on loopback'));
