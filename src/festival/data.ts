import type { Performer } from './types'
import { TODAYS_PICK_IDS as SCHEDULE_TODAY_PICKS } from './data/scheduleData'

export const PERFORMERS: Performer[] = [
  {
    id: '1',
    name: 'Luna & Strings',
    nameJa: 'ルナ＆ストリングス',
    act: 'Aerial violin',
    actJa: 'エアリアル・ヴァイオリン',
    tagline: 'Classical lines, neon nights.',
    gradient: 'linear-gradient(145deg, #0b1020 0%, #2a1f4a 38%, #c9a227 62%, #00e8c8 100%)',
    locale: 'Tokyo',
    likes: 12800,
    saves: 2400,
    heat: 98,
    genre: '音楽 × 空中',
    photoUrl: 'https://picsum.photos/seed/daidougei-luna/720/900',
    bio: 'クラシックの骨格に、ネオンとストリートの呼吸を重ねたデュオ。ヴァイオリンと空中動線で「歩道が劇場になる」瞬間をつくります。',
    achievementsDetail:
      '海外ストリートフェス出演多数 / 横浜開港記念イベント メインアクト / 配信ライブ累計 120 万再生（デモ数値）',
    snsList: [
      { label: 'Instagram', url: 'https://instagram.com' },
      { label: 'YouTube', url: 'https://youtube.com' },
    ],
    tipLinks: [
      { id: 't1', label: 'PayPay', labelJa: 'PayPay', url: 'https://paypay.ne.jp', kind: 'paypay' },
      { id: 't2', label: 'Stripe', labelJa: 'Stripe', url: 'https://stripe.com', kind: 'stripe' },
      { id: 't3', label: 'OFUSE', labelJa: 'OFUSE', url: 'https://ofuse.io', kind: 'ofuse' },
    ],
  },
  {
    id: '2',
    name: 'Kairo Firehouse',
    nameJa: 'カイロ・ファイアハウス',
    act: 'Fire dance',
    actJa: 'ファイアーダンス',
    tagline: 'Controlled chaos on the plaza.',
    gradient: 'linear-gradient(145deg, #120801 0%, #3a1200 40%, #ff6b00 68%, #ffd700 100%)',
    locale: 'Osaka',
    likes: 18400,
    saves: 5100,
    heat: 100,
    genre: 'ファイア / ダンス',
    photoUrl: 'https://picsum.photos/seed/daidougei-kairo/720/900',
    bio: '炎の輪と身体のリズムで広場の空気を一気に沸かすチーム。安全設計とドラマ性の両立を最優先にしています。',
    achievementsDetail: '大阪・関西万博関連イベント（デモ） / ナイトマーケット常連ヘッドライナー / 消防協力公演モデルケース',
    snsList: [
      { label: 'TikTok', url: 'https://tiktok.com' },
      { label: 'X', url: 'https://x.com' },
    ],
    tipLinks: [
      { id: 't1', label: 'Square', labelJa: 'Square', url: 'https://squareup.com', kind: 'square' },
      { id: 't2', label: 'Custom', labelJa: '公式投げ銭', url: 'https://example.com/tip-kairo', kind: 'other' },
    ],
  },
  {
    id: '3',
    name: 'Silent Mime Lab',
    nameJa: 'サイレント・マイム・ラボ',
    act: 'Mime & object theater',
    actJa: 'マイム・オブジェ劇',
    tagline: 'No words, full signal.',
    gradient: 'linear-gradient(145deg, #0a0a0a 0%, #2a2a2a 45%, #cfcfcf 70%, #7b68ee 100%)',
    locale: 'Paris × Nagoya',
    likes: 9200,
    saves: 3100,
    heat: 91,
    genre: 'マイム / サイレント',
    photoUrl: 'https://picsum.photos/seed/daidougei-mime/720/900',
    bio: '言葉を使わずに物語を立ち上げる実験室。オブジェと光のコントラストで、子どもから観光客まで幅広く届きます。',
    achievementsDetail: 'アヴィニョンオフ（デモ表記） / 名古屋クラフトフェス招待 / サイレントシアター教材監修',
    snsList: [{ label: 'Instagram', url: 'https://instagram.com' }],
    tipLinks: [{ id: 't1', label: 'Ko-fi', labelJa: 'Ko-fi', url: 'https://ko-fi.com', kind: 'other' }],
  },
  {
    id: '4',
    name: 'Orbit Jugglers',
    nameJa: 'オービット・ジャグラーズ',
    act: 'Contact juggling',
    actJa: 'コンタクトジャグリング',
    tagline: 'Crystal orbits in slow motion.',
    gradient: 'linear-gradient(145deg, #000510 0%, #003a4a 48%, #00d4ff 78%, #c9a227 100%)',
    locale: 'Sapporo',
    likes: 7600,
    saves: 1800,
    heat: 87,
    genre: 'ジャグリング',
    photoUrl: 'https://picsum.photos/seed/daidougei-orbit/720/900',
    bio: '透明球体の軌道が夕暮れの空と重なる。スローモーションの美学と、歓声が乗るテンポ設計が得意です。',
    achievementsDetail: '雪まつりストリート部門（デモ） / コンタクト専門ワークショップ全国ツアー',
    snsList: [{ label: 'YouTube', url: 'https://youtube.com' }],
    tipLinks: [
      { id: 't1', label: 'PayPal', labelJa: 'PayPal', url: 'https://paypal.com', kind: 'other' },
      { id: 't2', label: 'Stripe', labelJa: 'Stripe', url: 'https://stripe.com', kind: 'stripe' },
    ],
  },
  {
    id: '5',
    name: 'Velvet Acrobats',
    nameJa: 'ベルベット・アクロバット',
    act: 'Partner acrobatics',
    actJa: 'パートナーアクロ',
    tagline: 'Human architecture, velvet light.',
    gradient: 'linear-gradient(145deg, #14081f 0%, #4a1538 42%, #d4af37 72%, #ff2fb3 100%)',
    locale: 'Yokohama',
    likes: 15300,
    saves: 4200,
    heat: 95,
    genre: 'アクロバット',
    photoUrl: 'https://picsum.photos/seed/daidougei-velvet/720/900',
    bio: '二人で組み上げる「人間の建築」。ベルベットの照明と金のラインが、みなとみらいの夜景と相性抜群です。',
    achievementsDetail: '横浜赤レンガストリート常連 / 企業キックオフ演出多数 / TV バラエティ出演（デモ）',
    snsList: [
      { label: 'Instagram', url: 'https://instagram.com' },
      { label: 'TikTok', url: 'https://tiktok.com' },
    ],
    tipLinks: [
      { id: 't1', label: 'OFUSE', labelJa: 'OFUSE', url: 'https://ofuse.io', kind: 'ofuse' },
      { id: 't2', label: 'PayPay', labelJa: 'PayPay', url: 'https://paypay.ne.jp', kind: 'paypay' },
    ],
  },
]

/** 本日のおすすめ（ダミー選定） */
export const TODAYS_PICK_IDS: string[] = [...SCHEDULE_TODAY_PICKS]

export const SPOTLIGHT_IDS = ['1', '5', '3'] as const

/** 人気ランキング用（heat 降順で並べ替えた ID） */
export const HOT_RANK_IDS = [...PERFORMERS].sort((a, b) => b.heat - a.heat).map((p) => p.id)

export function performerById(id: string) {
  return PERFORMERS.find((p) => p.id === id)
}
