import type { OpsMetrics } from './_snapshot.js'
import { pctChange } from './_snapshot.js'

export type OpsProposalDraft = {
  agent: 'ceo' | 'growth'
  title: string
  body: string
  severity: 'info' | 'warning' | 'critical'
  payload: Record<string, unknown>
}

export type OpsAlert = {
  text: string
  severity: 'info' | 'warning' | 'critical'
}

function fmtPct(v: number | null): string {
  if (v == null) return '計測データ不足'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v}%`
}

function fmtCvr(v: number | null): string {
  if (v == null) return '計測データ不足（分母10件未満）'
  return `${Math.round(v * 1000) / 10}%`
}

export function buildAlerts(today: OpsMetrics, yesterday: OpsMetrics | null): OpsAlert[] {
  if (!yesterday) {
    return [{ text: '前日スナップショットがなく、前日比アラートは出せません。計測データ不足。', severity: 'info' }]
  }
  const alerts: OpsAlert[] = []
  const tipDelta = pctChange(today.tips_count, yesterday.tips_count)
  if (tipDelta != null && tipDelta <= -20) {
    alerts.push({ text: `投げ銭件数が前日比${tipDelta}%低下`, severity: 'warning' })
  }
  const signDelta = pctChange(today.signups, yesterday.signups)
  if (signDelta != null && signDelta <= -20) {
    alerts.push({ text: `新規登録が前日比${signDelta}%低下`, severity: 'warning' })
  }
  const liveDelta = pctChange(today.lives, yesterday.lives)
  if (liveDelta != null && liveDelta <= -20) {
    alerts.push({ text: `LIVE開始数が前日比${liveDelta}%低下`, severity: 'info' })
  }
  return alerts
}

export function runGrowthAgent(today: OpsMetrics, yesterday: OpsMetrics | null): OpsProposalDraft {
  const sparse = today.events_tracked < 10
  const lines: string[] = []
  lines.push('【Growth】登録・投げ銭・LIVE・フォロー・投票・ファネル')
  lines.push('')
  lines.push(`登録 ${today.signups}（前日比 ${fmtPct(yesterday ? pctChange(today.signups, yesterday.signups) : null)}）`)
  lines.push(`投げ銭 ${today.tips_count}件 / ¥${today.tips_amount}（前日比 ${fmtPct(yesterday ? pctChange(today.tips_count, yesterday.tips_count) : null)}）`)
  lines.push(`LIVE開始 ${today.lives}（前日比 ${fmtPct(yesterday ? pctChange(today.lives, yesterday.lives) : null)}）`)
  lines.push(`フォロー ${today.follows} / 投票 ${today.votes}`)
  lines.push('')
  lines.push('ファネル（プロフィール閲覧 → 投げ銭ボタン → 投げ銭成功）')
  lines.push(`view_performer ${today.view_performer}`)
  lines.push(`click_tip ${today.click_tip}（閲覧→押下 CVR ${fmtCvr(today.cvr_view_to_click)}）`)
  lines.push(`tip_success ${today.tip_success}（押下→成功 CVR ${fmtCvr(today.cvr_click_to_success)}）`)
  lines.push(`閲覧→成功 CVR ${fmtCvr(today.cvr_view_to_success)}`)
  lines.push('')

  let title = 'Growth：現状は安定。継続観測'
  let severity: OpsProposalDraft['severity'] = 'info'
  let opportunity = 'データが溜まるまで大きな施策は保留'

  if (sparse) {
    title = 'Growth：計測データ不足'
    lines.push('結論は出しません。product_events が10件未満です。公開後の実利用を待ってください。')
    opportunity = '計測データ不足'
  } else if (
    today.view_performer >= 10 &&
    today.cvr_view_to_click != null &&
    yesterday?.cvr_view_to_click != null &&
    today.cvr_view_to_click < yesterday.cvr_view_to_click &&
    today.view_performer >= yesterday.view_performer
  ) {
    title = 'Growth：投げ銭CTA押下率が低下'
    severity = 'warning'
    lines.push('原因候補：プロフィール閲覧は維持/増加しているが、投げ銭ボタン押下率が低下。')
    opportunity = '投げ銭CTAの視認性を人間が確認（自動ではUIを変更しません）'
  } else if (today.tips_count === 0 && today.live_view_start >= 10) {
    title = 'Growth：視聴はあるが投げ銭ゼロ'
    severity = 'warning'
    lines.push('LIVE視聴イベントはあるが、本日の投げ銭成功が0件。')
    opportunity = '配信中の投げ銭導線を人間が確認'
  } else {
    lines.push('大きな異常は見当たりません。')
  }

  lines.push('')
  lines.push(`機会: ${opportunity}`)
  lines.push('実行はしません。承認後も人間が既存画面で判断してください。')

  return {
    agent: 'growth',
    title,
    body: lines.join('\n'),
    severity,
    payload: { action_type: 'none', opportunity, metrics: today },
  }
}

export function runCeoAgent(input: {
  today: OpsMetrics
  yesterday: OpsMetrics | null
  growth: OpsProposalDraft
  pendingCount: number
  alerts: OpsAlert[]
}): OpsProposalDraft {
  const { today, yesterday, growth, pendingCount, alerts } = input
  const sparse = today.events_tracked < 10
  const problem = sparse
    ? '計測データ不足'
    : alerts[0]?.text ?? growth.title.replace(/^Growth：/, '')
  const opportunity =
    typeof growth.payload.opportunity === 'string' ? growth.payload.opportunity : '継続観測'

  const body = [
    `今日の最重要課題：`,
    problem,
    '',
    '原因候補：',
    sparse ? 'イベントログがまだ少ない' : growth.body.split('\n').find((l) => l.startsWith('原因候補')) || '数値の前日比を確認',
    '',
    '提案：',
    growth.title,
    '',
    '期待効果：',
    sparse ? '計測が溜まればCVRと前日比が使える' : '公開後の改善判断ができるようになる',
    '',
    'リスク：',
    '自動実行なし。UI・決済・BANは人間判断。',
    '',
    `承認待ち案件：${pendingCount}件`,
    yesterday ? `登録 ${today.signups} / 投げ銭 ${today.tips_count}件 / LIVE ${today.lives} / DAU相当 ${today.dau}` : '前日比は計測データ不足',
  ].join('\n')

  return {
    agent: 'ceo',
    title: sparse ? 'CEO：計測データ不足。観測を優先' : `CEO：${problem}`,
    body,
    severity: sparse ? 'info' : alerts[0]?.severity === 'warning' ? 'warning' : 'info',
    payload: { action_type: 'none', source: 'growth', opportunity, metrics: today },
  }
}
