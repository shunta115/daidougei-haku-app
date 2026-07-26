/**
 * デモ / 公開モードの一元管理。
 * VITE_APP_MODE=demo|public 未設定時は安全側：
 * - 開発サーバー → demo
 * - 本番ビルド → public
 *
 * import.meta.env を直接 === 比較し、Vite の定数畳み込みで
 * 未使用デモデータを本番バンドルから落とせるようにする。
 */
export type AppRuntimeMode = 'demo' | 'public'

export const APP_MODE: AppRuntimeMode =
  import.meta.env.VITE_APP_MODE === 'demo'
    ? 'demo'
    : import.meta.env.VITE_APP_MODE === 'public'
      ? 'public'
      : import.meta.env.DEV
        ? 'demo'
        : 'public'

export const isDemoMode = APP_MODE === 'demo'
export const isPublicMode = APP_MODE === 'public'

/** 固定デモ時計を使うか */
export const useDemoClock = isDemoMode

/** 上部に「デモデータ」表示 */
export const showDemoBadge = isDemoMode

/** デモ用の isLive / ダミー配信を許可 */
export const enableMockStreams = isDemoMode

/** 会場混雑度のデモ値を表示するか */
export const enableMockCrowdLevels = isDemoMode

/** デモ審査申請のシード */
export const enableDemoSeedData = isDemoMode

export const runtimeConfig = {
  mode: APP_MODE,
  isDemoMode,
  isPublicMode,
  useDemoClock,
  showDemoBadge,
  enableMockStreams,
  enableMockCrowdLevels,
  enableDemoSeedData,
} as const
