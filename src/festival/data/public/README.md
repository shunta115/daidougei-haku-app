# 公開イベントデータの編集ガイド

大道芸博アプリの**公開モード**用データは、次のフォルダに集約しています。

`src/festival/data/public/`

デモ用の出演者・日程は別経路（`src/festival/data.ts` の DEMO_*）にあり、
`VITE_APP_MODE=public` または本番ビルドでは公開データだけが使われます。

---

## 編集するファイル

| ファイル | 内容 |
|----------|------|
| `eventMeta.ts` | イベント名、開催日ラベル、会場名、開場時間、公式URL、開催メモ |
| `performers.ts` | 出演者プロフィール・画像URL・LIVE・配信URL |
| `venues.ts` | 会場一覧・混雑度（任意） |
| `schedule.ts` | 公演枠・おすすめ/スポットライト ID |
| `validatePublicData.ts` | ID重複・日時形式の検査（通常は触らない） |

---

## 出演者の追加

1. `performers.ts` の `PUBLIC_PERFORMERS` 配列にオブジェクトを追加する
2. `id` は他と重複しない文字列にする（例: `luna-2026`）
3. `approvalStatus: 'approved'` と `canStream: true` で配信候補になる
4. `isLive: true` にする場合は **必ず有効な `streamUrl`（https）** を入れる
5. `photoUrl` は https の実画像。未設定ならイニシャル表示
6. 架空の人物・実績を本番情報として書かない

---

## 公演の追加

1. 先に `venues.ts` / `performers.ts` に会場・出演者を登録する
2. `schedule.ts` の `PUBLIC_SCHEDULE_SLOTS` に枠を追加
3. `date` は `YYYY-MM-DD`、`start`/`end` は `HH:mm`（日本時間想定）
4. `performerId` / `venueId` は上記の id と一致させる
5. `status` は `scheduled` を基本。当日の進行で `live` / `next` / `delayed` / `cancelled` / `indoor_moved`

---

## 画像の追加

- 推奨: 公開可能な CDN / Storage の https URL を `photoUrl` に設定
- ローカル画像を使う場合は `public/` 配下に置き、`/your-image.jpg` を指定
- picsum 等のランダム画像は公開データに使わない

---

## LIVE 状態の変更

1. 対象出演者の `isLive` を `true` / `false`
2. `true` のときは `streamUrl` 必須（未設定だと視聴不可・準備中表示）
3. 任意で `streamTitle` を設定
4. 管理画面の override（localStorage）は**デモ用**。公開データはファイルを正とする

---

## 開催日・会場名の表示

`eventMeta.ts` の `dateLabel` / `placeLabel` を埋めるとホーム上部に表示されます。
空のままなら「次回開催情報は準備中です」と出ます。

---

## 公開前の確認コマンド

```bash
# 型チェック
npm exec -- tsc -p tsconfig.app.json --noEmit

# 公開モードビルド（デモデータがバンドルに乗らないこと）
VITE_APP_MODE=public npm run build

# デモ確認用
VITE_APP_MODE=demo npm run build

# プレビュー
npm run preview
```

開発サーバー起動時は `validatePublicData` が警告を出すことがあります（ID不一致など）。

---

## やってはいけないこと

- 未確定の開催日を本番情報として書く
- Stripe デモ URL を `supportUrl` に残す
- 無効な配信 URL で `isLive: true` にする
- デモ用 localStorage の内容を公開の真実とみなす
