import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Planning assumptions, not a measured encoding guarantee or a current FX quote.
const quality = {
  '360p': { videoMbps: .6, audioMbps: .048 },
  '480p': { videoMbps: 1, audioMbps: .048 },
  '720p': { videoMbps: 2, audioMbps: .064 },
}
const viewers = [5, 10, 50, 100, 500, 1000, 5000, 10000]
const performers = [20, 100, 1000], hours = [1, 3], days = [15, 30]
const overhead = 1.15, usdJpy = 150, assumedTax = 1.10
const round = n => Math.round(n * 1e6) / 1e6
export function simulate({ viewers: v, performers: p, hoursPerDay: h, daysPerMonth: d, quality: q }) {
  const bitrate = (quality[q].videoMbps + quality[q].audioMbps) * overhead
  const gbPerHour = bitrate * .45
  const broadcastHours = p * h * d
  const viewerHours = broadcastHours * v
  const participantMinutes = broadcastHours * (v + 1) * 60
  const upstreamSFUGB = broadcastHours * gbPerHour
  const downstreamGB = viewerHours * gbPerHour
  const cfUSD = Math.max(0, downstreamGB - 1000) * .05
  const shipUSD = 50 + Math.max(0, participantMinutes - 150000) * .0005 + Math.max(0, downstreamGB - 250) * .12
  const scaleUSD = 500 + Math.max(0, participantMinutes - 1500000) * .0004 + Math.max(0, downstreamGB - 3000) * .10
  const freeWholeHours = Math.min(5000 / ((v + 1) * 60), 50 / (v * gbPerHour))
  return {
    quality:q, viewersPerBroadcast:v, performers:p, hoursPerDay:h, daysPerMonth:d,
    broadcastHours, viewerHours, participantMinutes,
    prototypeControlPlaneEstimate:{
      pollingRequests:participantMinutes*60, heartbeatOrSeatRenewalRequests:participantMinutes*20,
      baseTotalRequests:participantMinutes*80,
      assumedResponseKBPerRequest:1,assumedRequestKBPerRequest:.5,
      responseGB:round(participantMinutes*80*1000/1e9),requestGB:round(participantMinutes*80*500/1e9),
      cost:'not priced: lab runs locally; national hosting/free quotas and current HAKU remaining quota unverified',
      note:'Lab protocol only: 1s polling + 3s renewal. Initial auth/join/SDP/retries, control-only owner, headers and retransmits can add requests/bytes. Do not use this inefficient protocol nationally.',
    },
    assumedTotalMbpsPerViewer:round(bitrate), gbPerViewerHour:round(gbPerHour),
    phoneUplinkP2PMbps:round(v * bitrate), phoneUplinkSFUMbps:round(bitrate),
    phoneGBPerBroadcastHourP2P:round(v * gbPerHour), phoneGBPerBroadcastHourSFU:round(gbPerHour),
    totalPhoneUplinkP2PGB:round(downstreamGB), totalPhoneUplinkSFUGB:round(upstreamSFUGB),
    totalViewerDownlinkGB:round(downstreamGB), SFUOutboundGB:round(downstreamGB),
    p2pWithoutTURNMediaProviderUSD:0,
    p2pPrototypeAllowsRequestedAudience:v <= 5,
    p2pProductionHostingCost:'unknown; signaling/auth/hosting and phone data excluded from media-provider USD',
    turnRatioScenarios:[0,.1,1].map(r=>({ratio:r,turnEgressToViewersGB:round(downstreamGB*r),cloudflareTurnStandaloneUSD:round(Math.max(0,downstreamGB*r-1000)*.05)})),
    cloudflareSFU:{freeGB:1000,outboundRateUSDPerGB:.05,fixedMediaUSD:0,estimatedMediaUSD:round(cfUSD),
      estimatedJPY:Math.ceil(cfUSD*usdJpy),estimatedJPYWithAssumed10PercentTax:Math.ceil(cfUSD*usdJpy*assumedTax),
      mediaWithinFreeAllowance:downstreamGB<=1000,providerHardZeroCapVerified:false,
      turnWithSameSFUAdditionalMediaUSD:0,hostingWorkersAuthCost:'excluded; separate billing'},
    livekitBuild:{fixedUSD:0,freeParticipantMinutes:5000,freeDownstreamGB:50,concurrentParticipantsCap:100,
      fitsMonthlyMediaAndTime:participantMinutes<=5000&&downstreamGB<=50,
      hardCapBlocksNewRequests:true,fullRequestedSchedulePossible:participantMinutes<=5000&&downstreamGB<=50&&v+1<=100,
      aggregateBroadcastHoursAvailableAtConstantAudience:round(freeWholeHours),
      maxSimultaneousBroadcasts:Math.floor(100/(v+1)),
      simultaneousAllPerformersFits:p*(v+1)<=100,
      estimatedOverageUSD:0,status:'free Build refuses new requests after cap; do not interpret as full schedule delivered'},
    livekitShipHypothetical:{fixedUSD:50,mediaAndTimeUSD:round(shipUSD-50),totalUSD:round(shipUSD),
      estimatedJPYWithAssumed10PercentTax:Math.ceil(shipUSD*usdJpy*assumedTax),
      maxConcurrentParticipants:1000,oneRequestedBroadcastFitsConcurrency:v+1<=1000,
      allPerformersConcurrent:p*(v+1)<=1000,activated:false},
    livekitScaleHypothetical:{fixedUSD:500,mediaAndTimeUSD:round(scaleUSD-500),totalUSD:round(scaleUSD),
      estimatedJPYWithAssumed10PercentTax:Math.ceil(scaleUSD*usdJpy*assumedTax),
      maxConcurrentParticipants:5000,oneRequestedBroadcastFitsConcurrency:v+1<=5000,
      allPerformersConcurrent:p*(v+1)<=5000,activated:false},
    averageSimultaneousBroadcastsIfEvenlySpread24Hours:p*h/24,
    averageSimultaneousParticipantsOnActiveDay:p*h*(v+1)/24,
    excludedCosts:['signaling HTTP requests/bytes','auth/DB usage','frontend hosting/egress','client cellular data','device power','staff moderation','recording disabled','LiveKit Egress prohibited'],
  }
}
const scenarios=[]
for (const p of performers) for (const h of hours) for (const d of days) for(const v of viewers) for(const q of Object.keys(quality)) scenarios.push(simulate({viewers:v,performers:p,hoursPerDay:h,daysPerMonth:d,quality:q}))
const output = {
  asOf:'2026-10-28 Asia/Tokyo', units:'decimal GB (1 GB = 1e9 bytes); Mbps includes assumed 15% packet overhead',
  fx:'hypothetical 150 JPY/USD, not current exchange rate',assumedTax:'10% sensitivity only; actual tax treatment not verified',
  dimensions:{viewers,performers,hoursPerDay:hours,daysPerMonth:days,quality},scenarioCount:scenarios.length,
  notes:[
    'Viewers are a constant simultaneous audience PER performer, not total HAKU viewers.',
    'All monthly free allowances are shared account-wide; existing traffic is assumed zero in this optimistic comparison.',
    'New-request rejection is documented for Build; ongoing sessions are not claimed to be instantly terminated.',
    'SFU one publisher sends one stream. Simulcast or overlapping handoff would add upload and is excluded.',
    'TURN estimate counts predominantly unidirectional media sent from relay to viewer. ICE/RTCP/reverse traffic may add bytes.',
    'Cloudflare TURN attached to Cloudflare SFU is not double-billed. SFU and standalone TURN share 1000 GB if mixed.',
    'Resolution alone does not define bitrate. Actual consumption must be measured.',
    'LiveKit uses per-resource rounding (minimum 10 sec RTC session; transfer .01 GB). These estimates do not model reconnect rounding.',
    'Open-source SFU license cost is zero; server, bandwidth, TURN and maintenance have no established zero-cost budget.',
    'Large LiveKit price numbers are unit-rate arithmetic, not quotes: concurrency, volume contracts, and capacity validation required.',
  ],
  sources:{
    cloudflare:'https://developers.cloudflare.com/realtime/sfu/platform/pricing/',
    turn:'https://developers.cloudflare.com/realtime/turn/faq/',
    livekitPricing:'https://livekit.com/pricing',
    livekitCaps:'https://docs.livekit.io/deploy/admin/quotas-and-limits/',
    livekitMetering:'https://docs.livekit.io/deploy/admin/billing/',
  },scenarios,
}
const dir = fileURLToPath(new URL('../docs/free-live/', import.meta.url)); await mkdir(dir,{recursive:true})
const compact = JSON.stringify({ ...output, scenarios: [] }, null, 2).replace('"scenarios": []', '"scenarios": [\n' + scenarios.map(s => '    ' + JSON.stringify(s)).join(',\n') + '\n  ]')
await writeFile(dir+'simulation-288.json',compact+'\n')
let md='# HAKU LIVE 全288条件の試算\n\n2026-10-28 JST。画質は動画0.6/1/2Mbps＋音声48/48/64kbps、通信余裕15%。GBは十進。視聴者数は「各出演者あたり」。金額はUSD、ホスティング・認証・DB・利用者の携帯代を除く。Cloudflare欄は有料超過を許可した仮定の計算で、導入済みではない。LiveKit Buildは全条件で月間参加者分が超過するため、全予定を0円で消化できない。\n\n'
for(const p of performers) for(const h of hours) for(const d of days) {
  md+=`## ${p}人 × 1日${h}時間 × 月${d}日\n\n|各LIVE視聴者|月間参加者分|360p 下りGB / CF USD|480p 下りGB / CF USD|720p 下りGB / CF USD|\n|---:|---:|---:|---:|---:|\n`
  for(const v of viewers){
    const row=Object.keys(quality).map(q=>scenarios.find(s=>s.performers===p&&s.hoursPerDay===h&&s.daysPerMonth===d&&s.viewersPerBroadcast===v&&s.quality===q))
    md+=`|${v.toLocaleString('en-US')}|${row[0].participantMinutes.toLocaleString('en-US')}|${row.map(s=>`${s.totalViewerDownlinkGB.toLocaleString('en-US',{maximumFractionDigits:2})} / $${s.cloudflareSFU.estimatedMediaUSD.toLocaleString('en-US',{maximumFractionDigits:2})}`).join('|')}|\n`
  }
  md+='\n'
}
md+='詳細の上り、TURN 0/10/100%、固定費、LiveKit Ship/Scale参考値、同時接続制約は [simulation-288.json](simulation-288.json) と生成元スクリプトを参照。\n'
await writeFile(dir+'simulation-matrix.md',md)
console.log(JSON.stringify({scenarios:scenarios.length,minimum:scenarios[0],maximum:scenarios.at(-1)},null,2))
