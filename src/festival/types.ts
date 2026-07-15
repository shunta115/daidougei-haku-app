/** 来場者 / 出演者・関係者 / 運営 — 将来はロールクレームで置き換え可能 */
export type AppPersona = 'visitor' | 'performer' | 'admin'

/** 来場者モードの下部ナビ */
export type VisitorTab = 'home' | 'performers' | 'timetable' | 'map' | 'tips' | 'oshi'

/** 出演者モード内の画面遷移（将来ログイン後のダッシュボードに拡張） */
export type PerformerFlow =
  | 'hub'
  | 'register'
  | 'registerComplete'
  | 'myRegistrations'
  | 'streamRegister'
  | 'streamRegisterComplete'

/** 配信希望パフォーマー登録（事務局審査） */
export type StreamApprovalStatus = 'pending' | 'approved' | 'rejected'

export type StreamPerformerApplication = {
  id: string
  createdAt: string
  updatedAt: string
  status: StreamApprovalStatus
  performerName: string
  realName: string
  email: string
  activityRegion: string
  genre: string
  snsUrl: string
  streamDescription: string
  reviewMessage: string
  /** 承認時に既存パフォーマーIDへ紐づけ（任意） */
  linkedPerformerId?: string
}

/** 登録データのうち id / 作成日時以外（管理画面編集用） */
export type EditableRegistrationFields = Omit<PerformerRegistration, 'id' | 'createdAt' | 'updatedAt'>

export type TipLinkKind = 'paypay' | 'stripe' | 'square' | 'ofuse' | 'other'

export type TipLink = {
  id: string
  label: string
  labelJa: string
  url: string
  kind: TipLinkKind
}

export type SnsLink = {
  label: string
  url: string
}

/** 演目ステータス（変更・中止・雨天移動を表現） */
export type ShowStatus =
  | 'scheduled'
  | 'live'
  | 'next'
  | 'delayed'
  | 'cancelled'
  | 'indoor_moved'

export type ScheduleSlot = {
  id: string
  /** YYYY-MM-DD */
  date: string
  /** HH:mm */
  start: string
  end: string
  performerId: string
  venueId: string
  stageJa: string
  stageEn: string
  status: ShowStatus
  noteJa?: string
  noteEn?: string
  windowJa?: string
  windowEn?: string
}

export type VenueArea = {
  id: string
  nameJa: string
  nameEn: string
  blurbJa: string
  blurbEn: string
  gradient: string
  /** 将来: 混雑指標のプレースホルダー */
  crowd?: 'low' | 'mid' | 'high'
}

/** 配信パフォーマーの事務局審査 */
export type PerformerApprovalStatus = 'pending' | 'approved' | 'rejected'

export type Performer = {
  id: string
  name: string
  nameJa: string
  act: string
  actJa: string
  tagline: string
  gradient: string
  locale: string
  /** 国・地域（配信UI用） */
  country: string
  likes: number
  saves: number
  heat: number
  approvalStatus: PerformerApprovalStatus
  canStream: boolean
  isLive: boolean
  streamTitle?: string
  /** WEB完結投げ銭（外部決済） */
  supportUrl: string
  /** 宣材写真（URL）。将来は Supabase Storage / CDN に差し替え */
  photoUrl?: string
  /** 長めのプロフィール */
  bio?: string
  /** 主な実績（詳細テキスト） */
  achievementsDetail?: string
  /** ジャンル（検索・フィルタ用） */
  genre?: string
  /** 30秒紹介動画（URL）。未設定時はプレースホルダー表示 */
  introVideoUrl?: string
  snsList?: SnsLink[]
  tipLinks?: TipLink[]
}

export type ProgramPulse = {
  id: string
  mode: 'live' | 'next'
  performerId: string
  /** マップフォーカス用 */
  venueId?: string
  venueJa: string
  venueEn: string
  stageJa: string
  stageEn: string
  windowJa: string
  windowEn: string
}

/** 運営レビュー状態 */
export type RegistrationStatus = 'pending' | 'approved' | 'hidden'

export type PerformerRegistration = {
  /** 将来 Supabase 移行時のマイグレーション用（クライアントは v1 固定） */
  schemaVersion?: number
  id: string
  createdAt: string
  updatedAt: string
  status: RegistrationStatus
  artistName: string
  /** 代表者名（運営連絡用） */
  realName: string
  email: string
  phone: string
  genre: string
  /** 活動拠点 */
  activityBase: string
  profile: string
  achievements: string
  snsUrl: string
  website: string
  photoUrl: string
  tipUrl: string
  preferredDates: string
  /** 希望ステージ（フリーテキスト） */
  preferredStage: string
  /** 動画URL */
  videoUrl: string
  /** 運営への連絡事項 */
  staffNote: string
  notes: string
}

/** 将来ロードマップ項目（UIのみ） */
export type FutureCapability = {
  id: string
  titleJa: string
  titleEn: string
  hint: string
}

/** Phase1 来場者コア（NOW / NEXT / 推し / MAP）— 詳細は phase1/types.ts */
export type {
  MapVenuePin,
  NextUpCardData,
  NowPlayingCardData,
  Phase1FavoriteEntry,
  Phase1HomeFeed,
  Phase1MapTarget,
  Phase1NavTarget,
  Phase1NextUp,
  Phase1NowPlaying,
  Phase1PlaybackBundle,
  Phase1ScheduleStatus,
} from './phase1/types'
