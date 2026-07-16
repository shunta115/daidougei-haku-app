/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** demo | public。未設定時は DEV→demo / 本番ビルド→public */
  readonly VITE_APP_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
