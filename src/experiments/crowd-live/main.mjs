import QRCode from 'qrcode';
import { supabase } from '../../platform/lib/supabase.ts';
import { LocalWhipPublisher } from '../../../experiments/ovh-srs-lab/whip-publisher.mjs';

const TEST_HOST = 'aeqskxxykzapgaudbeqa.supabase.co';
const $ = id => document.getElementById(id);
const status = message => { $('status').textContent = message; };
const configUrl = import.meta.env.VITE_SUPABASE_URL;
const gatewayText = import.meta.env.VITE_CROWD_TEST_GATEWAY_URL;
let gateway, session, actorId, roomId, qrToken, publisher, timer, watchRoom, facing = 'environment';

function validGateway(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
        url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}
function requestError(error) {
  if (error?.name === 'NotAllowedError') return 'カメラ・マイクが許可されていません。Safariのサイト設定を確認してください。';
  if (error?.name === 'NotFoundError') return 'カメラまたはマイクが見つかりません。';
  if (error?.name === 'NotReadableError') return 'カメラを使用できません。他のアプリを閉じて再試行してください。';
  return '開始できませんでした。通信と配信権限を確認してください。';
}
async function api(path, data, method = 'POST') {
  const { data: current } = await supabase.auth.getSession();
  const token = current.session?.access_token;
  if (!token) throw new Error('login_required');
  const response = await fetch(gateway + path, {
    method, headers: { Authorization: 'Bearer ' + token, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    body: method === 'POST' ? JSON.stringify(data || {}) : undefined,
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'request_failed');
  return result;
}
async function ensureRoom() {
  if (roomId) return roomId;
  const room = await api('/rooms', { title: 'HAKU CROWD LIVE TEST' });
  roomId = room.id;
  return roomId;
}
function updateLinks(performerId) {
  const id = encodeURIComponent(performerId);
  $('tip').href = '/live?tipTo=' + id;
  $('profile').href = '/live?profile=' + id;
}
function startHeartbeat(peerId, epoch) {
  clearInterval(timer);
  timer = setInterval(() => {
    if (publisher?.state !== 'live') return;
    void api('/heartbeat?room=' + encodeURIComponent(roomId), { peerId, epoch }).catch(() => {
      stopCapture('配信権限または通信が失効しました。映像送信を停止しました。');
    });
  }, 5000);
}
function stopCapture(message = '配信を停止しました。') {
  clearInterval(timer);
  publisher?.stop();
  $('start').disabled = false;
  $('switch').disabled = true;
  $('stop').disabled = true;
  $('emergency').disabled = true;
  status(message);
}
async function stopRoom() {
  if (!roomId) return;
  try { await api('/stop?room=' + encodeURIComponent(roomId)); }
  catch { /* Server lease expires if this request cannot finish. */ }
}
async function begin(grant) {
  if (!roomId || !grant?.nonce) throw new Error('grant_missing');
  const { data: current } = await supabase.auth.getSession();
  const token = current.session?.access_token;
  if (!token) throw new Error('login_required');
  const peerId = grant.peerId;
  publisher = new LocalWhipPublisher({
    getUserMedia: constraints => navigator.mediaDevices.getUserMedia(constraints),
    PeerConnection: RTCPeerConnection,
    fetchImpl: (...args) => fetch(...args),
    onPreview: stream => { $('preview').srcObject = stream; },
    onState: state => { if (state === 'live') status('LIVE配信中'); },
  });
  $('start').disabled = true;
  status('カメラ・マイクを起動中…');
  try {
    await publisher.start(gateway + '/whip?room=' + encodeURIComponent(roomId), {
      headers: {
        Authorization: 'Bearer ' + token,
        'x-haku-peer-id': peerId,
        'x-haku-grant-nonce': grant.nonce,
        'x-haku-grant-epoch': String(grant.epoch),
      },
      mediaConstraints: { video: { facingMode: { ideal: facing } }, audio: { echoCancellation: true, noiseSuppression: true } },
    });
    $('switch').disabled = false;
    $('stop').disabled = false;
    $('emergency').disabled = false;
    startHeartbeat(peerId, grant.epoch);
  } catch (error) {
    stopCapture(requestError(error));
    await stopRoom();
  }
}
function hls(room) { watchRoom = room; }
async function init() {
  try {
    if (!supabase || new URL(configUrl).hostname !== TEST_HOST) throw new Error('test_auth_only');
    gateway = validGateway(gatewayText);
    if (!gateway) throw new Error('test_gateway_unavailable');
    const auth = await supabase.auth.getSession();
    session = auth.data.session;
    if (!session) { $('login').hidden = false; status('HAKU TESTへのログインが必要です。'); return; }
    actorId = session.user.id;
    const { data: profile, error } = await supabase.from('profiles').select('role,status').eq('id', actorId).single();
    if (error || profile?.status !== 'active') throw new Error('profile_unavailable');
    const hash = new URLSearchParams(location.hash.slice(1));
    roomId = hash.get('room');
    qrToken = hash.get('token');
    if (roomId && qrToken) {
      $('camera').hidden = false;
      const state = await api('/state?room=' + encodeURIComponent(roomId), null, 'GET');
      updateLinks(state.performerId);
      hls(roomId);
      $('watcher').hidden = false;
      const { data: performer } = await supabase.from('performers').select('stage_name').eq('id', state.performerId).maybeSingle();
      $('performerName').textContent = (performer?.stage_name || 'パフォーマー') + ' のLIVEを撮影';
      status('撮影同意のうえ、LIVE配信を開始してください。');
    } else if (profile.role === 'performer') {
      $('owner').hidden = false;
      $('camera').hidden = false;
      $('start').hidden = true;
      status('本人の配信、または観客の代理配信を選べます。');
    } else {
      status('出演者のQRを読み込んでください。');
    }
  } catch { status('TEST環境の設定または登録情報を確認できません。'); }
}
$('makeQr').addEventListener('click', async () => {
  try {
    const room = await ensureRoom();
    await api('/consent?room=' + encodeURIComponent(room), { allowed: true });
    const qr = await api('/qr?room=' + encodeURIComponent(room));
    const link = new URL(location.pathname, location.origin);
    link.hash = new URLSearchParams({ room, token: qr.token }).toString();
    await QRCode.toCanvas($('qr'), link.href, { width: 260, margin: 2 });
    $('qr').hidden = false;
    $('qrLink').hidden = false;
    $('qrLink').href = link.href;
    $('qrLink').textContent = '撮影者用リンクを開く';
    updateLinks(actorId);
    hls(room);
    $('watcher').hidden = false;
    $('emergency').disabled = false;
    status('代理配信を事前許可しました。QRは5分間有効です。');
  } catch { status('QRを発行できません。出演者承認と通信を確認してください。'); }
});
$('direct').addEventListener('click', async () => {
  try {
    const room = await ensureRoom();
    const peerId = 'owner-' + crypto.randomUUID();
    const grant = await api('/direct?room=' + encodeURIComponent(room), { peerId });
    await begin({ ...grant, peerId });
  } catch (error) { status(requestError(error)); }
});
$('start').addEventListener('click', async () => {
  try {
    if (!qrToken) throw new Error('qr_required');
    const peerId = 'camera-' + crypto.randomUUID();
    const grant = await api('/request?room=' + encodeURIComponent(roomId), { peerId, token: qrToken, consent: true });
    await begin({ ...grant, peerId });
    history.replaceState(null, '', location.pathname);
    qrToken = null;
  } catch (error) { status(requestError(error)); }
});
$('switch').addEventListener('click', async () => {
  try {
    facing = facing === 'environment' ? 'user' : 'environment';
    await publisher.switchCamera(facing);
  } catch { status('カメラを切り替えられませんでした。現在の映像を維持します。'); }
});
$('stop').addEventListener('click', () => { stopCapture(); void stopRoom(); });
$('emergency').addEventListener('click', () => { stopCapture('本人がLIVEを停止しました。'); void stopRoom(); });
$('play').addEventListener('click', async () => {
  try {
    if (!watchRoom) throw new Error('room_missing');
    const { ticket } = await api('/watch-ticket?room=' + encodeURIComponent(watchRoom), null, 'GET');
    const stream = 'haku-lab-' + watchRoom.replaceAll('-', '');
    $('watch').src = gateway + '/live/' + stream + '.m3u8?watch=' + encodeURIComponent(ticket);
    await $('watch').play();
  } catch { status('本人または撮影者のログインと配信状態を確認してください。'); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && publisher?.state === 'live') { stopCapture('画面を離れたため送信を停止しました。'); void stopRoom(); }
});
window.addEventListener('pagehide', () => {
  if (publisher?.state === 'live') { stopCapture(); void stopRoom(); }
});
void init();
