const OFFICIAL_AWP_AWARDS: Record<string, string[]> = {
  'Mr.↓YU↑': ['天満天神街道芸祭 2011〜2016年度 優勝', '第1回 開国下田大道芸コンテスト 優勝', '第2回 リトルワールド大道芸コンテスト 優勝'],
  '大道芸人ジーニー': ['六芸神グランプリ 優勝', '芸王グランプリ 準優勝', 'ヒーローウッドエンターテイメント1分動画グランプリ 優勝'],
  'エンジョイJoy': ["大道芸コロシアムin武蔵小金井'10 優勝", "大道芸コロシアムin本牧'10 準優勝", "大道芸コロシアムin武蔵小金井'11 準優勝"],
  '大道芸人ヒヨコ': ['World Dexterity Championship champion'],
  'ポール': ['ギネス世界記録参加 2024 November united kingdom-Most users to complete a remote one mile distance in 24 hours', 'ギネス世界記録参加 2023 July 日本 横浜 Largest plastic bottle mosaic', 'オーストラリアSpecialバスキングライセンス受賞（取得）'],
  '福井陽翔人': ['テンヨージュニアマジック杯 4位', '北海道パフォーマンスグランプリ 優勝', 'チカパコンペティション2019 準優勝'],
  'Entertainer MIKIYA': ['第5回イオンモール明和 大道芸フェスティバル 優勝', '第3回チカパコンペティション 優勝'],
  ITSUZAI: ['BATOLIVE2018 準優勝', 'Double Dutch 2016 in KOREA 優勝'],
  'Performer 聖夜': ['DDL OBJECT MANIPULATION 部門（海外（ロサンゼルス）主催ダンスバトル）優勝'],
  '大道芸人ゆうた': ['第二回手羽先サミットパフォーマンスコンテスト本戦 入賞'],
  MUTSUKIN: ['全国芸王グランプリ 千葉大会 優勝', 'ムーンウォーク世界大会 市長賞'],
  紙磨呂: ['2015 Germany "International competition of street magicians" St. Wendel 1Prize', '2016 Germany “Bamberg zaubert” won first place in the audience vote.', '2022 Itaria Torino “Masters of Magic” StreetMagician World ChampionShip 1Prize'],
}

const ALIASES: Record<string, string> = { 'Mr.↓YU↑（ミスターユー）': 'Mr.↓YU↑', 'MUTSUKIN（ムツキン）': 'MUTSUKIN' }

export const AWP_AWARDS_SOURCE = 'https://prtimes.jp/main/html/rd/p/000000125.000016503.html'

export function officialAwpAwards(name: string): string[] {
  return OFFICIAL_AWP_AWARDS[ALIASES[name] ?? name] ?? []
}
