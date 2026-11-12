import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import QRCode from 'qrcode'
import { Camera, CameraOff, Radio, QrCode, ShieldCheck, Users, Heart, Gift, RotateCcw, Square, ArrowRight, Flag, Volume2 } from 'lucide-react'
import { DirectPeers, deviceLoopback, PHONE_VIDEO, type Meter, type PeerMessage } from './peer'
import './style.css'

type Actor = { id: string; role: string; name: string; fixtureId?: string }
type Room = {
  id: string; performerId: string; phase: string; epoch: number; deadline: number; reason: string | null
  crowdAllowed: boolean; viewers: number; viewerLimit: number; publisherPeer: string | null
  publisherId: string | null; publisherUntil: number | null; queue: {actorId: string; peerId: string}[]
  canClaim: boolean; dailyUsedSeconds: number; dailyLimitSeconds: number
}
type Grant = { nonce: string; epoch: number }
const EMPTY_METER: Meter = { sent: 0, received: 0, connected: 0, relay: false }
const DEVICE_ONLY = document.documentElement.dataset.deviceOnly === 'true'
const HOSTED_LAB = document.documentElement.dataset.hostedLab === 'true'
const initialUrl = new URL(location.href)
const fragment = new URLSearchParams(initialUrl.hash.slice(1))
const initialRoomId = initialUrl.searchParams.get('room') || ''
const isCrowd = fragment.has('crowd')
const isWatch = initialUrl.searchParams.has('watch')
const labels: Record<string, string> = {
  ready: '配信待機', arming: 'カメラ準備中', live: '配信中', switching: 'カメラ交代中', ended: '配信終了',
}
const errors: Record<string, string> = {
  viewer_limit: '視聴枠は5人までです。空きができてから再接続してください。',
  invalid_or_expired_qr: 'QRの期限が切れたか、許可が取り消されました。本人に新しいQRを表示してもらってください。',
  performer_consent_required: 'パフォーマー本人の許可が必要です。',
  daily_safety_limit: '本日の試作上限に達したため停止しました。課金して続行する機能はありません。',
  camera_busy: '現在のカメラが終了するまでお待ちください。',
  session_ended: '配信が終了しました。このQRと配信権限は失効しています。',
  already_requested: 'すでに交代待ちです。本人の交代操作をお待ちください。',
  authentication_required: '検証用アカウントを選び直してください。',
  sites_sign_in_required: 'この確認サイトの所有者のChatGPTアカウントでログインしてください。',
  lab_daily_request_limit: '本日の接続管理テストの上限に達しました。追加購入は行わず停止します。',
  lab_store_busy: '接続管理が混み合っています。少し待ってから再接続してください。',
  lab_unavailable: '接続管理を利用できません。カメラは停止したままです。再読み込みしてください。',
}
function message(error: unknown) {
  const text = error instanceof Error ? error.message : '接続できませんでした。'
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || text === 'NotAllowedError' || /Permission denied|not allowed/i.test(text)) return 'カメラ・マイクが許可されていません。Safariのサイト設定を確認してください。'
  if (name === 'NotFoundError') return 'カメラまたはマイクが見つかりません。iPhoneのSafariで開いて確認してください。'
  if (name === 'NotReadableError') return 'カメラまたはマイクを使えません。ほかのカメラアプリを閉じてから再度お試しください。'
  return errors[text] || text
}
function Video({ stream, muted = true, label }: { stream: MediaStream | null; muted?: boolean; label?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.srcObject = stream
    void ref.current.play().catch(() => undefined)
  }, [stream])
  return <video ref={ref} autoPlay muted={muted} playsInline aria-label={label || 'LIVE映像'} />
}

function App() {
  const [mode, setMode] = useState<'loading' | 'local' | 'device'>(DEVICE_ONLY ? 'device' : 'loading')
  const [actor, setActor] = useState<Actor | null>(null)
  const [fixtures, setFixtures] = useState<{id: string; name: string}[]>([])
  const [room, setRoom] = useState<Room | null>(null)
  const [roomId, setRoomId] = useState(initialRoomId)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [remote, setRemote] = useState<MediaStream | null>(null)
  const [loopStreams, setLoopStreams] = useState<(MediaStream | null)[]>([])
  const [meter, setMeter] = useState<Meter>(EMPTY_METER)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [qr, setQr] = useState<{url: string; image: string; until: number} | null>(null)
  const [watchQr, setWatchQr] = useState('')
  const [consent, setConsent] = useState(false)
  const [watching, setWatching] = useState(false)
  const [sound, setSound] = useState(false)
  const [deviceCrowd, setDeviceCrowd] = useState(false)
  const [deviceAllowed, setDeviceAllowed] = useState(false)
  const [deviceLive, setDeviceLive] = useState(false)
  const [demoDialog, setDemoDialog] = useState('')
  const tokenRef = useRef('')
  const peerId = useRef(DEVICE_ONLY ? 'device-only' : crypto.randomUUID?.() || '')
  const actorRef = useRef<Actor | null>(null)
  const roomRef = useRef<Room | null>(null)
  const roomIdRef = useRef(roomId)
  const mediaRef = useRef<MediaStream | null>(null)
  const generation = useRef(0)
  const epochRef = useRef<number | null>(null)
  const peersRef = useRef<DirectPeers | null>(null)
  const loopRef = useRef<Awaited<ReturnType<typeof deviceLoopback>> | null>(null)
  const loopAbort = useRef<AbortController | null>(null)
  const leaseUntil = useRef(0)
  const watchingRef = useRef(false)
  const faceRef = useRef<'environment' | 'user'>('environment')
  const meterBase = useRef({ sent: 0, received: 0 })
  const pollBusy = useRef(false)
  const heartbeatBusy = useRef(false)
  const updateRoom = useCallback((next: Room) => { roomRef.current = next; setRoom(next) }, [])
  const api = useCallback(async <T,>(action: string, data: Record<string, unknown> = {}, keepalive = false): Promise<T> => {
    if (DEVICE_ONLY) throw new Error('この確認画面では外部への配信やデータ保存は行いません。')
    if (!peerId.current) throw new Error('HTTPSのSafariで開いてください。安全な接続IDを作成できません。')
    const body = JSON.stringify({ action, roomId: roomIdRef.current, peerId: peerId.current, ...data, requestId: crypto.randomUUID() })
    for (let attempt = 0; ; attempt++) {
      const res = await fetch('/api/free-live', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
        body, keepalive, signal: keepalive ? undefined : AbortSignal.timeout(8000),
      })
      const result = await res.json()
      if (HOSTED_LAB && result.error === 'lab_store_busy' && attempt < 2 && !keepalive) {
        await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1))); continue
      }
      if (!res.ok) throw new Error(result.error || '接続に失敗しました')
      return result as T
    }
  }, [])

  // Stop physical tracks synchronously, including capture that resolves after navigation.
  const stopMedia = useCallback(() => {
    generation.current++; loopAbort.current?.abort(); loopAbort.current = null
    mediaRef.current?.getTracks().forEach(track => track.stop()); mediaRef.current = null
    peersRef.current?.close(); peersRef.current = null
    loopRef.current?.close(); loopRef.current = null
    epochRef.current = null; leaseUntil.current = 0
    setStream(null); setRemote(null); setLoopStreams([]); setDeviceLive(false)
    setMeter(previous => ({ ...previous, connected: 0 }))
  }, [])
  const stopAll = useCallback((reason = '配信を終了しました。') => {
    const hasPublishing = epochRef.current !== null
    stopMedia(); setNotice(reason)
    watchingRef.current = false; setWatching(false)
    if (mode === 'local' && roomIdRef.current) {
      if (hasPublishing || actorRef.current?.id === roomRef.current?.performerId) {
        void api<Room>('stop', {}, true).then(updateRoom).catch(() => undefined)
      } else void api('leave', {}, true).catch(() => undefined)
    }
  }, [mode, api, stopMedia, updateRoom])

  const login = useCallback(async (fixtureId: string) => {
    stopMedia(); watchingRef.current = false; setWatching(false)
    const result = await api<{ actor: Actor; token: string }>('login', { fixtureId })
    tokenRef.current = result.token; actorRef.current = result.actor; setActor(result.actor)
    setError('')
  }, [api, stopMedia])
  useEffect(() => {
    if (DEVICE_ONLY) return () => stopMedia()
    let alive = true
    void fetch('/api/free-live').then(async res => {
      if (!res.ok) {
        const failure = await res.json().catch(() => ({}))
        throw new Error(failure.error || 'lab_unavailable')
      }
      const config = await res.json()
      if (config.mode !== (HOSTED_LAB ? 'sites-owner-lab' : 'local-fixtures')) throw new Error('lab_unavailable')
      if (!alive) return
      setMode('local'); setFixtures(config.fixtures)
      await login(isCrowd || isWatch ? 'demo-fan-1' : 'demo-performer')
    }).catch(error => { if (alive) { if (HOSTED_LAB) setError(message(error)); else setMode('device') } })
    return () => { alive = false; stopMedia() }
  }, [login, stopMedia])
  useEffect(() => {
    let active = true
    if (!roomId) { setWatchQr(''); return }
    const url = `${location.origin}${location.pathname}?room=${roomId}&watch=1`
    void QRCode.toDataURL(url, { width: 240, margin: 2 }).then(image => { if (active) setWatchQr(image) }).catch(() => undefined)
    return () => { active = false }
  }, [roomId])
  useEffect(() => {
    const hidden = () => { if (document.hidden) stopAll('画面を離れたためカメラ・マイクを停止しました。再開はボタンを押してください。') }
    const gone = () => stopAll('画面を閉じたため停止しました。')
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', gone)
    return () => { document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', gone) }
  }, [stopAll])
  useEffect(() => {
    const timer = setInterval(() => {
      if (epochRef.current !== null && Date.now() > leaseUntil.current) stopAll('接続確認が途切れたため安全停止しました。新しい配信を開始してください。')
    }, 500)
    return () => clearInterval(timer)
  }, [stopAll])

  const makePeers = useCallback((epoch: number, capture?: MediaStream) => {
    peersRef.current?.close()
    const peers = new DirectPeers({ stream: capture, epoch, stun: true,
      send: m => api('signal', { message: m }),
      onRemote: setRemote, onProblem: setError,
    })
    peersRef.current = peers; return peers
  }, [api])

  useEffect(() => {
    if (mode !== 'local' || !actor || !roomId) return
    const poll = async () => {
      if (pollBusy.current) return
      pollBusy.current = true
      try {
        const result = await api<{ state: Room; peers: {peerId: string; actorId: string}[]; messages: PeerMessage[] }>('poll')
        const oldEpoch = roomRef.current?.epoch
        updateRoom(result.state)
        if (epochRef.current !== null && (result.state.epoch !== epochRef.current || result.state.publisherPeer !== peerId.current)) {
          stopMedia()
          if (result.state.phase === 'switching') await api('stopped')
          setNotice('前のカメラを停止しました。次の撮影者の開始を待っています。')
        }
        if (result.state.phase === 'ended') { stopMedia(); watchingRef.current = false; setWatching(false); return }
        if (watchingRef.current && result.state.phase === 'live' && (oldEpoch !== result.state.epoch || !peersRef.current)) makePeers(result.state.epoch)
        if (result.state.phase !== 'live' && watchingRef.current) { peersRef.current?.close(); peersRef.current = null; setRemote(null) }
        const peers = peersRef.current
        for (const m of result.messages) await peersRef.current?.receive(m)
        if (peers && epochRef.current !== null) {
          peers.retain(result.peers.map(p => p.peerId))
          await Promise.all(result.peers.map(p => peers.offer(p.peerId, p.actorId)))
        }
      } catch (err) { setError(message(err)) }
      finally { pollBusy.current = false }
    }
    void poll(); const timer = setInterval(() => void poll(), 1000)
    return () => clearInterval(timer)
  }, [mode, actor, roomId, api, updateRoom, stopMedia, makePeers])
  useEffect(() => {
    if (mode !== 'local' || !roomId) return
    const timer = setInterval(() => {
      if (heartbeatBusy.current) return
      if (epochRef.current !== null) {
        heartbeatBusy.current = true
        const epoch = epochRef.current
        void api<Room>('heartbeat', { epoch }).then(next => {
          if (epochRef.current !== epoch) return
          leaseUntil.current = next.publisherUntil || 0; updateRoom(next)
        }).catch(err => {
          if (err instanceof Error && err.message === 'publish_lease_revoked') {
            stopMedia()
            void api<Room>('state').then(async next => {
              updateRoom(next)
              if (next.phase === 'switching') await api('stopped')
            }).catch(() => undefined)
            setNotice('配信権限が切り替わったため、カメラとマイクを停止しました。')
          } else if (err instanceof Error && err.message === 'session_ended') {
            stopMedia(); setNotice('配信を終了しました。')
          } else { stopAll('接続に失敗したため安全停止しました。'); setError(message(err)) }
        }).finally(() => { heartbeatBusy.current = false })
      } else if (watchingRef.current) {
        heartbeatBusy.current = true
        void api<Room>('join').then(updateRoom).catch(err => { watchingRef.current = false; setWatching(false); stopMedia(); setError(message(err)) }).finally(() => { heartbeatBusy.current = false })
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [mode, roomId, api, updateRoom, stopAll, stopMedia])
  useEffect(() => {
    const timer = setInterval(() => {
      const source = peersRef.current || loopRef.current
      if (source) void source.meter().then(next => {
        if (next.relay) { stopAll('許可されていない中継を検知したため停止しました。'); return }
        setMeter({ ...next, sent: meterBase.current.sent + next.sent, received: meterBase.current.received + next.received })
        if (next.sent > 1_500_000_000) stopAll('端末送信量の試作上限に達したため停止しました。')
      }).catch(() => undefined)
    }, 1000)
    return () => clearInterval(timer)
  }, [stopAll])

  const run = async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await fn() } catch (err) { setError(message(err)) }
    finally { setBusy(false) }
  }
  const ensureRoom = async () => {
    if (roomRef.current && roomRef.current.phase !== 'ended') return roomRef.current
    const next = await api<Room>('create')
    roomIdRef.current = next.id; setRoomId(next.id); updateRoom(next)
    history.replaceState(null, '', `${location.pathname}?room=${next.id}`)
    return next
  }
  const capture = async () => {
    const version = ++generation.current
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('HTTPSのSafariで開いてください。カメラを利用できません。')
    const next = await navigator.mediaDevices.getUserMedia({
      video: { ...PHONE_VIDEO, facingMode: { ideal: faceRef.current } },
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    })
    if (generation.current !== version || document.hidden) { next.getTracks().forEach(track => track.stop()); throw new Error('画面を離れたため開始を中止しました。') }
    mediaRef.current = next; setStream(next)
    next.getTracks().forEach(track => { track.onended = () => stopAll('カメラまたはマイクが切断されたため停止しました。') })
    return next
  }
  const publish = async (grant: Grant) => {
    try {
      const next = await capture()
      const state = await api<Room>('claim', { nonce: grant.nonce, epoch: grant.epoch })
      if (mediaRef.current !== next || document.hidden) { stopAll(); return }
      epochRef.current = state.epoch; leaseUntil.current = state.publisherUntil || 0
      updateRoom(state); makePeers(state.epoch, next)
      setNotice('配信を開始しました。視聴は5人まで。画面ロックや他アプリへの切替で停止します。')
    } catch (err) { stopMedia(); await api('stop').catch(() => undefined); throw err }
  }
  const startDirect = () => run(async () => {
    if (mode === 'device') {
      await capture(); setDeviceLive(true)
      setNotice('端末内のカメラテスト中です。映像は他の端末へ配信されていません。'); return
    }
    await ensureRoom(); const grant = await api<Grant>('direct'); await publish(grant)
  })
  const permitCrowd = () => run(async () => {
    if (mode === 'device') { setDeviceAllowed(true); setNotice('本人の事前許可をONにしました（この端末内の操作デモ）。'); return }
    await ensureRoom(); updateRoom(await api<Room>('consent', { allowed: true }))
    const code = await api<{token: string; until: number}>('qr')
    const url = `${location.origin}${location.pathname}?room=${roomIdRef.current}#crowd=${encodeURIComponent(code.token)}`
    setQr({ url, until: code.until, image: await QRCode.toDataURL(url, { width: 240, margin: 2 }) })
  })
  const startCrowd = () => run(async () => {
    if (!consent) throw new Error('周囲の撮影許可と通信量の注意事項を確認してください。')
    if (mode === 'device') {
      if (!deviceAllowed) throw new Error('デモの「本人の事前許可」をONにしてください。')
      await capture(); setDeviceLive(true); setNotice('CROWDの端末内テストです。外部には配信されません。'); return
    }
    const pending = await api<Grant | null>('pending')
    const grant = pending || await api<Grant & {queued?: boolean}>('request', { qrToken: fragment.get('crowd'), consent })
    if ('queued' in grant) { setNotice('カメラの交代待ちに入りました。本人が交代すると開始できます。'); return }
    await publish(grant)
  })
  const join = () => run(async () => {
    const next = await api<Room>('join'); updateRoom(next)
    watchingRef.current = true; setWatching(true)
    if (next.phase === 'live') {
      makePeers(next.epoch)
      if (next.publisherPeer && next.publisherId) await api('signal', { message: { type: 'reconnect', to: next.publisherPeer, targetId: next.publisherId, epoch: next.epoch } })
    }
    setNotice('接続中です。映像が出ない場合は回線を変えて再接続してください。')
  })
  const testFive = () => run(async () => {
    const next = mediaRef.current || await capture()
    setDeviceLive(true)
    loopRef.current?.close(); loopAbort.current?.abort()
    const abort = new AbortController(); loopAbort.current = abort
    const version = generation.current
    setLoopStreams([]); setNotice('端末内の接続を準備しています。接続成立を確認中です。')
    let result: Awaited<ReturnType<typeof deviceLoopback>>
    try {
      result = await deviceLoopback(next, (i, value) => setLoopStreams(prev => { const list = [...prev]; list[i] = value; return list }), abort.signal)
    } catch (err) { stopMedia(); setNotice(''); throw err }
    if (generation.current !== version || document.hidden) result.close()
    else { loopRef.current = result; setNotice('端末内で5つの接続が成立しました。映像が黒い場合は表示の確認が必要です。外部端末への配信は未検証です。') }
  })

  const owner = actor?.id === room?.performerId || (!room && actor?.role === 'performer')
  const publishing = !!stream
  const crowdView = mode === 'device' ? deviceCrowd : isCrowd || actor?.role === 'fan' && !isWatch
  const crowdStream = mode === 'local' && room?.publisherId ? room.publisherId !== room.performerId : crowdView
  const phase = mode === 'device' ? (deviceLive ? '端末内テスト中' : 'カメラ待機') : labels[room?.phase || 'ready']
  const mb = (n: number) => `${(n / 1_000_000).toFixed(1)} MB`
  return <div className="lab-app">
    <header className="lab-header"><a className="wordmark" href={DEVICE_ONLY ? './' : '/haku-free-live.html'}>HAKU<span>LIVE LAB</span></a><span className="prototype">PROTOTYPE {HOSTED_LAB ? '02' : '01'}</span></header>
    <main>
      <div className="lab-heading"><div><p className="eyebrow">その瞬間を、誰かのスマホで。</p><h1>ステージは、<br /><span>ここにある。</span></h1></div><Radio className="hero-radio" size={60} /></div>
      <div className={`mode-note ${mode === 'local' ? 'local' : ''}`} role="status"><ShieldCheck size={18}/><div><b>{HOSTED_LAB ? '所有者だけの非公開LIVEテスト' : mode === 'local' ? 'ローカル実配信テスト · テスト用アカウント' : 'この端末のカメラ・操作を試す確認画面'}</b><p>{HOSTED_LAB ? '最大5視聴・1回15分。全端末で所有者のChatGPTログインが必要です。HAKU本番・決済には接続しません。' : mode === 'local' ? 'P2P / 最大5人 / TURN・SFUなし。本番データには接続しません。' : '映像はこの端末内だけで確認します。ほかの人への配信・録画・決済は行いません。'}</p></div></div>
      {mode === 'local' && <label className="fixture">{HOSTED_LAB ? 'この端末の役割（テスト専用）' : '検証用アカウント'}<select aria-label="検証用アカウント" value={actor?.fixtureId || actor?.id || ''} disabled={busy || publishing || watching} onChange={e => void run(() => login(e.target.value))}>{fixtures.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
      <div className="lab-grid"><section className="stage-card">
        <div className="stage">
          {(stream || remote) ? <Video stream={stream || remote} muted={!!stream || !sound} /> : <div className="stage-empty"><div className="camera-halo"><Camera size={36}/></div><h2>あなたの視点が、<br/>誰かの最前列になる。</h2><p>{crowdView ? '本人が許可したステージを、あなたのスマホから。' : 'ボタンを押して、カメラとマイクを許可。'}</p></div>}
          <div className="stage-top"><span className={publishing || remote ? 'live-pill active' : 'live-pill'}><i/>{phase}</span><span className="viewers"><Users size={14}/>{mode === 'local' ? `${room?.viewers || 0} / 5` : `端末内 ${meter.connected} / 5`}</span></div>
          <div className="stage-bottom"><div className="avatar">H</div><div><b>HAKU テストパフォーマー</b><small>{crowdStream ? 'CROWD LIVE' : 'DIRECT LIVE'} · 360p / 15fps</small></div><button className="follow" onClick={() => setDemoDialog('この確認画面ではフォローは保存されません。')} aria-label="フォロー"><Heart size={18}/></button></div>
        </div>
        {remote && <button className="sound-button" onClick={() => setSound(!sound)}><Volume2 size={16}/>{sound ? '消音する' : '音声をONにする'}</button>}
        <div className="mode-tabs" role="tablist" aria-label="配信方式">
          <button role="tab" aria-selected={!crowdView} disabled={publishing || mode === 'local'} onClick={() => setDeviceCrowd(false)}><Radio size={16}/>本人が配信</button>
          <button role="tab" aria-selected={crowdView} disabled={publishing || mode === 'local'} onClick={() => setDeviceCrowd(true)}><QrCode size={16}/>観客が配信</button>
        </div>
        <div className="stage-controls">
          {mode === 'local' && owner && room?.phase === 'live' && room.publisherId !== actor?.id && !publishing && !watching && <button className="outline" disabled={busy} onClick={join}><Radio size={18}/>観客カメラをこの画面で見る</button>}
          {crowdView && <><label className="consent-row"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>周囲の撮影許可を確認し、スマホの通信量を使うことに同意します。</span></label>{mode === 'device' && <label className="consent-row"><input type="checkbox" checked={deviceAllowed} onChange={e => setDeviceAllowed(e.target.checked)}/><span>本人の事前許可（操作デモ）</span></label>}</>}
          {!publishing && !watching && (isWatch && mode === 'local' ? <button className="primary" disabled={busy || !actor} onClick={join}><Radio size={19}/>LIVEを見る<ArrowRight size={18}/></button> : <button className="primary" disabled={busy || mode === 'loading' || mode === 'local' && !actor} onClick={crowdView ? startCrowd : startDirect}><Camera size={19}/>{busy ? '準備しています…' : room?.canClaim ? '交代してLIVEを開始する' : mode === 'device' ? 'カメラテストを開始する' : 'LIVE配信を開始する'}<ArrowRight size={18}/></button>)}
          {(publishing || watching) && <button className="stop" onClick={() => stopAll()}><Square size={16}/>カメラ・配信を停止</button>}
          <div className="secondary-controls">
            {watching && <button onClick={join} disabled={busy}><RotateCcw size={16}/>映像を再接続</button>}
            {!publishing && !watching && <button onClick={() => { faceRef.current = faceRef.current === 'environment' ? 'user' : 'environment'; setNotice(`${faceRef.current === 'environment' ? '背面' : '前面'}カメラで次回開始します。`) }}><RotateCcw size={16}/>前後カメラ</button>}
            <button className="tip" onClick={() => setDemoDialog('投げ銭は準備中です。この確認画面ではお金は動きません。')}><Gift size={17}/>投げ銭で応援</button>
            <button onClick={() => mode === 'local' && roomId ? void run(async () => { await api('report', { reason: 'privacy' }); stopMedia(); setNotice('通報を受け付け、テスト配信を緊急停止しました。') }) : (() => { stopMedia(); setDemoDialog('端末内のカメラを停止しました。この確認画面では通報は送信されません。'); })()}><Flag size={15}/>通報</button>
          </div>
        </div>
      </section>
      <aside>
        {(mode === 'local' && owner) && <section className="panel"><p className="section-kicker">CROWD LIVE</p><h2>観客に、カメラを託す。</h2><p>本人が許可した5分間のQRから参加。撮影者は一人ずつ交代します。</p><button className="outline" disabled={busy || room?.phase === 'ended'} onClick={permitCrowd}><QrCode size={18}/>観客カメラを許可してQR発行</button>
          {qr && <div className="qr-box"><img src={qr.image} alt="観客用の配信参加QRコード"/><a href={qr.url} target="_blank" rel="noreferrer">観客用リンクを開く</a><small>有効期限 {new Date(qr.until).toLocaleTimeString('ja-JP')} · {HOSTED_LAB ? '所有者の端末のみ' : 'ローカル接続のみ'}</small></div>}
          {room?.crowdAllowed && <button className="text-danger" onClick={() => void run(async () => { updateRoom(await api<Room>('consent', { allowed: false })); setQr(null) })}>観客の配信許可を取り消す</button>}
          {room?.queue.map((q, i) => <button className="outline" key={q.peerId} onClick={() => void run(async () => { updateRoom(await api<Room>('handoff', { nextPeer: q.peerId })) })}>撮影者 {i + 1} にカメラ交代</button>)}
          {roomId && <a className="watch-link" href={`${location.pathname}?room=${roomId}&watch=1`} target="_blank" rel="noreferrer">視聴用リンクを開く →</a>}
          {HOSTED_LAB && watchQr && <div className="qr-box"><img src={watchQr} alt="視聴用QRコード"/><small>別のスマホで読み取り、同じChatGPTアカウントでログインして視聴してください。</small></div>}
          {room && room.phase !== 'ended' && <button className="emergency" onClick={() => stopAll('本人の緊急停止を実行しました。')}><CameraOff size={17}/>すべての配信を緊急停止</button>}
        </section>}
        <section className="panel"><p className="section-kicker">ZERO RELAY COST</p><h2>無料を、仕組みで守る。</h2><div className="cost-line"><span>映像中継サービス利用</span><strong>¥0</strong></div><p>この試作は有料中継を使いません。端末の通信料金・電池は利用者負担です。</p><div className="metric-grid"><div><span>送信量（実測）</span><b>{mb(meter.sent)}</b></div><div><span>受信量（実測）</span><b>{mb(meter.received)}</b></div><div><span>映像接続数</span><b>{meter.connected} / 5</b></div><div><span>TURN中継</span><b>使用しない</b></div></div><small>5人へ送る目安は約1.68GB / 時間。電波・動きで変動。上限と計測値は通信会社の請求額を保証しません。</small></section>
        <section className="panel"><p className="section-kicker">DEVICE CHECK</p><h2>5つの受信接続を試す。</h2><p>同じ端末内のWebRTCテストです。外部の視聴者や携帯回線の接続検証ではありません。</p>{HOSTED_LAB ? <a className="watch-link" href="/device-check.html">端末内テスト画面を開く →</a> : <button className="outline" disabled={busy || watching || mode !== 'device'} onClick={testFive}><Users size={18}/>端末内で5接続を試す</button>}{loopStreams.length > 0 && <div className="loop-grid">{loopStreams.map((s, i) => <div key={i}><Video stream={s} label={`端末内受信 ${i + 1}`}/><span>端末内 {i + 1}</span></div>)}</div>}</section>
      </aside></div>
      {error && <div className="feedback error" role="alert">{error}</div>}
      {notice && !error && <div className="feedback" role="status">{notice}</div>}
      <footer><ShieldCheck size={16}/><p>カメラが許可されない場合は、このページをSafariで直接開いてください。<br/>画面ロック・アプリ切替でカメラとマイクを停止。自動では再開しません。<br/>iPhone Safari実機・異なる回線での動作は確認待ちです。</p></footer>
    </main>
    {demoDialog && <div className="dialog-backdrop"><div role="dialog" aria-modal="true" aria-label="試作の接続範囲" className="dialog"><ShieldCheck size={28}/><h2>HAKU連携の確認</h2><p>{demoDialog}</p><button className="primary" autoFocus onClick={() => setDemoDialog('')}>閉じる</button></div></div>}
  </div>
}

createRoot(document.getElementById('root')!).render(<App />)
