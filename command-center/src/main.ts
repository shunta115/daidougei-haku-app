type View = 'home' | 'live' | 'money' | 'people' | 'system'
type Scenario = 'sample' | 'empty' | 'offline'
type Level = 'critical' | 'review' | 'info'
type Metric = number | null
type Alert = { level: Level; label: string; title: string; description: string; view: View }

const views: Record<View, { name: string; english: string; icon: string }> = {
  home: { name: '概要', english: 'OVERVIEW', icon: 'grid' },
  live: { name: 'LIVE監視', english: 'LIVE MONITOR', icon: 'radio' },
  money: { name: '売上・精算', english: 'SETTLEMENT', icon: 'wallet' },
  people: { name: '出演者', english: 'PERFORMERS', icon: 'people' },
  system: { name: 'システム', english: 'SYSTEM', icon: 'pulse' },
}

const paths: Record<string, string> = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4m-8.4 0a6 6 0 0 1 0-8.4m11.3-2.9a10 10 0 0 1 0 14.2m-14.2 0a10 10 0 0 1 0-14.2"/>',
  wallet: '<path d="M3 7h16a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2l13-2v4m3 4h-5a2 2 0 0 0 0 4h5"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M2 20v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2m1-14a3 3 0 0 1 0 6m2 2a4 4 0 0 1 3 4v2"/>',
  pulse: '<path d="M2 12h5l3-7 4 14 3-7h5"/>',
  spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Zm7 1v4m-2-2h4"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5m-4.1-3a8 8 0 0 1 13-3L20 9M4 15l2.1 3a8 8 0 0 0 13-3"/>',
  shield: '<path d="m12 22 4-3c3-2 5-5 5-9V5l-9-3-9 3v5c0 4 2 7 5 9l4 3Zm-4-10 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  yen: '<path d="m6 4 6 8 6-8m-6 8v8m-5-7h10m-10 4h10"/>',
  alert: '<path d="M10 4 2 19a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1L14 4a2 2 0 0 0-4 0Zm2 5v4m0 3v1"/>',
}
const icon = (name: string) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ''}</svg>`

const lives = [
  { name: 'DEMO 演者 A', current: 96, peak: 123, start: '18:06', comments: 34, tips: 5200, heartbeat: true },
  { name: 'DEMO 演者 B', current: 32, peak: 46, start: '18:18', comments: 11, tips: 1600, heartbeat: true },
  { name: 'DEMO 演者 C', current: null, peak: 25, start: '18:22', comments: 8, tips: 0, heartbeat: false },
]
const balances = [
  { name: 'DEMO 演者 B', amount: 12000, age: 12, state: '要確認', connect: '確認待ち' },
  { name: 'DEMO 演者 D', amount: 9600, age: 6, state: '送金可能', connect: '登録済み' },
  { name: 'DEMO 演者 A', amount: 7000, age: 2, state: '未送金', connect: '登録済み' },
  { name: 'DEMO 演者 E', amount: 8300, age: 0, state: '送金済み', connect: '登録済み' },
]
const sales = [2400, 5300, 9000, 16300, 21300, 34000, 48600]
const money = (n: Metric) => n === null ? '未取得' : '¥' + n.toLocaleString('ja-JP')
const number = (n: Metric) => n === null ? '未取得' : n.toLocaleString('ja-JP')
const state = { view: 'home' as View, scenario: 'sample' as Scenario, updated: '18:42', question: 0 }
const questions = ['今日のHAKUの状況を教えて', '未送金の出演者は？', '現在のLIVEに問題はある？', '優先して確認すべきことは？', '昨日と比べてどう？']
const severity: Record<Level, number> = { critical: 0, review: 1, info: 2 }

function snapshot() {
  const sample = state.scenario === 'sample'
  const empty = state.scenario === 'empty'
  const rows = sample ? lives : []
  const unsettled = sample ? balances.filter(row => row.state !== '送金済み').reduce((sum, row) => sum + row.amount, 0) : empty ? 0 : null
  const issues: Alert[] = []
  if (sample && rows.some(row => !row.heartbeat)) issues.push({ level: 'critical', label: '要確認', title: 'LIVEの更新が途絶えています', description: 'DEMO 演者 C · 視聴人数の最終値は未取得', view: 'live' })
  if (sample && balances.some(row => row.age >= 7)) issues.push({ level: 'review', label: '要対応', title: '精算の確認が必要です', description: 'DEMO 演者 B · 12日経過・Connect確認待ち', view: 'money' })
  if (sample) issues.push({ level: 'info', label: '審査待ち', title: '出演者の申請が2件あります', description: '出演者プロフィールの確認へ', view: 'people' })
  if (!sample && !empty) issues.push({ level: 'critical', label: '取得失敗', title: 'DEMOの取得に失敗しました', description: '再読み込みで試行できます。指標は未取得です。', view: 'system' })
  return {
    sample, empty, rows, unsettled,
    liveCount: sample ? rows.length : empty ? 0 : null,
    sales: sample ? sales.at(-1)! : empty ? 0 : null,
    tips: sample ? rows.reduce((sum, row) => sum + row.tips, 0) : empty ? 0 : null,
    pending: sample ? 2 : empty ? 0 : null,
    issues: issues.sort((a, b) => severity[a.level] - severity[b.level]),
  }
}

function aiAnswer(d: ReturnType<typeof snapshot>) {
  if (!d.sample && !d.empty) return 'DEMOの取得に失敗したため、現在の状況を判定できません。再読み込みを試してください。'
  switch (state.question) {
    case 1: return d.sample ? '未送金は3人、合計¥28,600です。DEMO 演者 B は12日経過しており、Connectの確認が必要です。' : '未送金残高は¥0です。対象の出演者はいません。'
    case 2: return d.sample ? '配信3件のうち、DEMO 演者 C の更新が途絶えています。通信品質の実測値は未取得です。' : '配信中のLIVEはありません。'
    case 3: return d.issues[0] ? `最優先は「${d.issues[0].title}」です。${d.issues[0].description}。` : '現在のDEMOデータに対応事項はありません。'
    case 4: return d.sample ? '同じ時刻までの売上は、DEMOの昨日 ¥42,100 に対し、今日は ¥48,600 です。差額は +¥6,500 です。' : '昨日の比較データは未取得です。'
    default: return d.sample ? '配信は3件、売上は¥48,600です。まず、更新が途絶えたLIVE 1件を確認してください。' : '配信・売上・未送金残高はいずれも0です。'
  }
}

const badge = (label: string, color = 'neutral') => `<span class="badge ${color}"><i></i>${label}</span>`
const cardTitle = (title: string, caption: string) => `<header class="card-head"><div><p class="eyebrow">${caption}</p><h2>${title}</h2></div></header>`
const row = (label: string, value: string) => `<div class="data-row"><span>${label}</span><strong>${value}</strong></div>`
const noData = (d: ReturnType<typeof snapshot>) => `<p class="empty">${d.empty ? '該当するデータはありません。' : 'データを取得できませんでした。'}</p>`
const link = (view: View, label: string) => `<button class="text-btn" data-view="${view}">${label}${icon('arrow')}</button>`

function metric(label: string, value: string, detail: string, symbol: string, view: View, theme = '') {
  return `<button class="metric ${theme}" data-view="${view}"><span class="metric-top"><span class="icon-box">${icon(symbol)}</span>${icon('chevron')}</span><span class="metric-label">${label}</span><strong class="${value === '未取得' ? 'missing' : ''}">${value}</strong><span class="metric-note">${detail}</span></button>`
}

function chart(d: ReturnType<typeof snapshot>) {
  if (!d.sample) return `<section class="panel">${cardTitle('売上の推移', 'DEMO · TODAY')}${noData(d)}</section>`
  const points = sales.map((amount, i) => `${36 + i * 80},${142 - amount / 465}`)
  return `<section class="panel chart-panel">${cardTitle('売上の推移', 'DEMO · TODAY')}
  <div class="chart-total"><strong>${money(d.sales)}</strong><span class="badge positive">昨日同時刻 +¥6,500</span></div>
  <svg class="chart" viewBox="0 0 552 172" role="img" aria-label="DEMO累計売上。12時2,400円から18時42分48,600円へ推移">
    <defs><linearGradient id="area" x2="0" y2="1"><stop stop-color="#42ebce" stop-opacity=".24"/><stop offset="1" stop-color="#42ebce" stop-opacity="0"/></linearGradient></defs>
    <path d="M36 37H516M36 72H516M36 107H516M36 142H516" stroke="#263447" stroke-dasharray="4 5" fill="none"/>
    <polygon points="36,142 ${points.join(' ')} 516,142" fill="url(#area)"/>
    <polyline points="${points.join(' ')}" stroke="#60eacb" stroke-width="3" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="516" cy="${142 - sales.at(-1)! / 465}" r="5" fill="#85ffde"/>
    <g fill="#9aaac1" font-size="13" font-family="system-ui"><text x="32" y="165">12:00</text><text x="185" y="165">14:00</text><text x="342" y="165">16:00</text><text x="480" y="165">18:42</text></g>
  </svg><p class="fine">架空の累計値 · JST · 売上は応援を含む</p></section>`
}

function home(d: ReturnType<typeof snapshot>) {
  const title = d.sample ? '更新が途絶えたLIVEが1件あります' : d.empty ? '現在、対応が必要な項目はありません' : '運営データを取得できませんでした'
  return `<section class="hero"><div class="hero-copy"><p class="eyebrow hero-eyebrow">${icon('spark')} HAKU AI <span>ルールベース</span></p>
    <h2>${title}</h2><p>${d.sample ? '現在配信中の3件のうち1件で更新が止まっています。次に、精算の確認と出演者審査を進めてください。' : aiAnswer(d)}</p>
    ${d.issues[0] ? link(d.issues[0].view, '優先項目を見る') : ''}</div><div class="orbit" aria-hidden="true"><i></i><i></i><i></i><span>${icon('pulse')}</span></div></section>
    <section class="metrics" aria-label="主要指標">
    ${metric('LIVE配信', number(d.liveCount), d.sample ? '更新途絶 1件' : d.empty ? '現在の配信数' : '取得失敗', 'radio', 'live', 'accent')}
    ${metric('本日の売上', money(d.sales), d.sales === null ? '応援も未取得' : `うち応援 ${money(d.tips)}`, 'yen', 'money')}
    ${metric('未送金残高', money(d.unsettled), d.sample ? '要確認を含む · 3人' : d.empty ? '対象なし' : '取得失敗', 'wallet', 'money')}
    ${metric('出演者審査', number(d.pending), d.sample ? '申請の確認待ち' : d.empty ? '確認待ちなし' : '取得失敗', 'people', 'people')}
    </section>
    <div class="dashboard-grid"><section class="panel">${cardTitle('優先対応', 'ACTION QUEUE')}
    ${d.issues.length ? d.issues.map((item, i) => `<button class="queue" data-view="${item.view}"><span class="queue-index">0${i + 1}</span><span class="queue-content">${badge(item.label, item.level)}<strong>${item.title}</strong><small>${item.description}</small></span>${icon('chevron')}</button>`).join('') : '<p class="empty">対応が必要な項目はありません。</p>'}</section>
    ${chart(d)}</div>
    <section class="panel ai-panel">${cardTitle('HAKU AIに聞く', 'RULE-BASED · DEMO')}
    <div class="prompts" aria-label="質問を選択">${questions.map((q, i) => `<button data-question="${i}" aria-pressed="${state.question === i}">${q}</button>`).join('')}</div>
    <p class="answer" role="status">${aiAnswer(d)}</p></section>`
}

function live(d: ReturnType<typeof snapshot>) {
  return `<div class="section-grid">${d.rows.length ? d.rows.map(l => `<section class="panel"><div class="card-head"><h2>${l.name}</h2>${badge(l.heartbeat ? '配信中' : '更新途絶', l.heartbeat ? 'positive' : 'critical')}</div>
  ${row('同時視聴', number(l.current))}${row('最大同時視聴', number(l.peak))}${row('開始時刻（JST）', l.start)}${row('通信品質（実測）', '未取得')}${row('コメント', `${l.comments}件`)}${row('応援', money(l.tips))}</section>`).join('') : `<section class="panel">${noData(d)}</section>`}</div>`
}

function settlement(d: ReturnType<typeof snapshot>) {
  return `<div class="section-grid"><section class="panel">${cardTitle('本日の売上と手数料', 'DEMO · SETTLEMENT')}
    ${row('売上', money(d.sales))}${row('Stripe手数料', money(d.sample ? 1750 : d.empty ? 0 : null))}${row('HAKU手数料', money(d.sample ? 4860 : d.empty ? 0 : null))}
    ${row('出演者取り分', money(d.sample ? 41990 : d.empty ? 0 : null))}${row('返金・紛争', d.sample || d.empty ? '0件' : '未取得')}
    <p class="fine">集計元：架空のDEMO台帳 · スナップショット 18:42 JST · 実Stripeとの照合なし</p></section>
    <section class="panel">${cardTitle('出演者ごとの残高', '経過日数の長い順')}${d.sample ? [...balances].sort((a,b)=>b.age-a.age).map(b => `<details><summary><span>${b.name}</span><strong>${money(b.amount)}</strong></summary><div class="details-body">${row('精算状態', b.state)}${row('経過日数', b.age + '日')}${row('Connect', b.connect)}</div><p class="fine settlement-state">${b.state} · ${b.age}日</p></details>`).join('') : noData(d)}</section></div>`
}

function people(d: ReturnType<typeof snapshot>) {
  return `<div class="section-grid"><section class="panel">${cardTitle('出演者の状況', 'DEMO · DIRECTORY')}
  ${row('登録出演者', number(d.sample ? 36 : d.empty ? 0 : null))}${row('活動中（配信中）', number(d.liveCount))}${row('最近ログインした出演者', '未取得')}${row('要審査', number(d.pending))}
  ${row('LIVE実績', '未取得')}${row('Connect登録状況', d.sample ? '精算画面で確認' : '未取得')}${link('money','精算を表示')}</section>
  <section class="panel">${cardTitle('本日の出演予定', 'DEMO · JST')}${d.sample ? row('DEMO 演者 A', '18:00') + row('DEMO 演者 D', '19:15') + row('予約・通知の実績', '未取得') : noData(d)}</section></div>`
}

function system(d: ReturnType<typeof snapshot>) {
  return `<div class="section-grid"><section class="panel">${cardTitle('観測状況', 'SYSTEM STATUS')}${row('GitHub PR・CI','未取得')}${row('Vercelデプロイ','未取得')}${row('Supabase接続','未取得')}${row('インフラ費用','未取得')}${row('LIVE更新途絶（DEMO）',d.sample ? '1件' : d.empty ? '0件' : '未取得')}</section>
  <section class="panel">${cardTitle('表示シナリオ', 'PREVIEW SETTINGS')}<p class="fine">画面評価用の状態を切り替えます。</p><div class="prompts">
  ${([['sample','通常'],['empty','実績0件'],['offline','取得失敗']] as const).map(([id,name])=>`<button data-scenario="${id}" aria-pressed="${state.scenario === id}">${name}</button>`).join('')}</div></section></div>`
}

const root = document.querySelector<HTMLDivElement>('#app')!
function render(focus = '') {
  const d = snapshot()
  const view = views[state.view]
  const nav = Object.entries(views).map(([key, item]) => `<button data-view="${key}" ${state.view === key ? 'aria-current="page"' : ''}>${icon(item.icon)}<span>${item.name}</span></button>`).join('')
  const section = { home, live, money: settlement, people, system }[state.view]
  root.innerHTML = `<aside class="sidebar"><div class="brand"><span class="brand-mark">H</span><span>HAKU<small>COMMAND CENTER</small></span></div><p class="nav-label">WORKSPACE</p><nav aria-label="管理メニュー">${nav}</nav><div class="side-foot">${icon('shield')}<span>DEMO ワークスペース<small>架空データ · 読み取り専用</small></span></div></aside>
  <div class="shell"><header class="top"><div class="mobile-brand"><span class="brand-mark">H</span><span>HAKU <small>COMMAND CENTER</small></span></div><div class="top-context"><span>運営コンソール</span><span class="muted">/</span><span>${view.name}</span></div><div class="top-right">${badge('DEMO', 'positive')}<button class="icon-btn" data-refresh aria-label="DEMOを再読み込み" title="再読み込み">${icon('refresh')}</button></div></header>
  <main id="main" tabindex="-1"><div class="page-head"><div><p class="eyebrow">${view.english}</p><h1>${state.view === 'home' ? '運営ダッシュボード' : view.name}</h1></div><div class="as-of">${icon('clock')}<span>DEMO 11/08 18:42 JST<br><small>${state.updated === '18:42' ? '固定スナップショット' : '表示更新 ' + state.updated + ' JST'}</small></span></div></div>
  ${section(d)}<footer>HAKU COMMAND CENTER <span>DEMO · 架空のデータ · 本番接続なし</span></footer></main>
  <nav class="bottom" aria-label="モバイル管理メニュー">${nav}</nav></div>`
  if (focus) root.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true })
}

root.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
  if (!button) return
  const { view, question, scenario } = button.dataset
  if (view && view in views) {
    state.view = view as View
    render('#main')
    window.scrollTo(0, 0)
  } else if (question !== undefined) {
    state.question = Number(question)
    render(`[data-question="${question}"]`)
  } else if (scenario === 'sample' || scenario === 'empty' || scenario === 'offline') {
    state.scenario = scenario
    render(`[data-scenario="${scenario}"]`)
  } else if (button.hasAttribute('data-refresh')) {
    state.updated = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(new Date())
    render('[data-refresh]')
  }
})
render()
