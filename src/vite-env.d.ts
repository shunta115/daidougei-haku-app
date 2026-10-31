/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** demo | public。未設定時は DEV→demo / 本番ビルド→public */
  readonly VITE_APP_MODE?: string
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  readonly VITE_WEB_PUSH_PUBLIC_KEY?: string
  readonly VITE_ENABLE_LIVE_START_WEB_PUSH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
