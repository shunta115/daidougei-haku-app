# 公開β リリース候補チェックメモ（STEP 2-K）

最終確認日に合わせて更新してください。

## 必須コマンド

```bash
npm install
npm run build
npm exec -- tsc -p tsconfig.app.json --noEmit
VITE_APP_MODE=public npm run build
VITE_APP_MODE=demo npm run build
npm run preview
```

## 確認済み観点

- production build 成功
- TypeScript エラー 0
- 公開モードにデモ出演者・StripeデモURLが載らない
- 管理画面・出演者内部画面は本番非公開（DEV のみ）
- 応援は準備中表示（課金なし）
- 無効配信URLへ遷移しない
- 不正ハッシュでクラッシュしない

## 未追跡のまま残してよいもの

- `package-lock 2.json`
- `vite.config.js` / `vite.config.d.ts`（生成物の可能性）
- `tsconfig.node.tsbuildinfo`
