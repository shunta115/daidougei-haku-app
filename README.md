# 大道芸博アプリ（公開β）

来場者向けのストリートフェス体験 SPA（React + Vite + TypeScript）です。

## 開発

```bash
npm install
npm run dev
```

開発サーバーはデフォルトで **デモモード**（固定時計・デモ出演者）です。

## ビルド

```bash
# 本番相当（公開モード）
npm run build

# 明示的にモード指定
VITE_APP_MODE=public npm run build
VITE_APP_MODE=demo npm run build

npm run preview
npm run typecheck
```

## 公開データの編集

実開催情報は `src/festival/data/public/` に集約しています。  
手順は [src/festival/data/public/README.md](src/festival/data/public/README.md) を参照。

## 環境変数

`.env.example` をコピーして `.env` / `.env.local` を作成できます。

| 変数 | 説明 |
|------|------|
| `VITE_APP_MODE` | `demo` または `public`。未設定時は DEV→demo / 本番ビルド→public |

秘密鍵や Stripe / Supabase の本番キーは不要（このβでは未接続）です。

## Vercel への公開手順

1. GitHub 等に `release/public-beta`（または main）を push
2. [Vercel](https://vercel.com) で Import Project
3. Framework Preset: **Vite**
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Node.js Version: **20.x** 以上
7. Environment Variables（任意）:
   - `VITE_APP_MODE` = `public`
8. Deploy

`vercel.json` により SPA の直接 URL アクセスは `index.html` にフォールバックします。

### CLI でデプロイする場合

```bash
npx vercel login   # 初回のみ・ブラウザ認証が必要
npx vercel         # プレビュー
npx vercel --prod  # 本番
```

ログインやチーム選択はユーザー操作が必要です。

## リリースチェック

[docs/RELEASE_CANDIDATE_CHECKLIST.md](docs/RELEASE_CANDIDATE_CHECKLIST.md)

## ライセンス / 注意

- 管理画面・出演者内部画面は本番ビルドでは非公開です
- オンライン応援・独自配信基盤は準備中表示です
- デモデータを本番情報として公開しないでください
