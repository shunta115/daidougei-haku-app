# AWP PR #2〜#5 統合検証（2026-10-08 JST）

基準main: `b725b02`。統合ブランチ: `integrate/awp-pr-2-5`。
各PRのコミットをマージし、履歴を保持しています。mainへのマージ、本番デプロイ、DB変更は行っていません。

| PR | 確認したhead | 保持した変更 |
| --- | --- | --- |
| #2 | `a54a6e5` | 端末票数の表示・保存、旧方式設定の分離、OPEN/STOPの部分保存 |
| #3 | `158c7fe` | Asia/Tokyoでの日時表示、明示的な+09:00による保存、空欄・不正値処理 |
| #4 | `ca98587` | 端末投票API由来のSUPPORT、複数応援先、読込失敗・不明ID対応 |
| #5 | `0aa273c` | 中止枠の候補除外、時刻表での中止理由表示、CTA無効化、保存済み観たいID保持 |

## 競合解消

- AdminEventOpsの投票受付UIは#2の構造・OPEN/STOP処理に#3の日時変換とJST説明を統合。
- EventScreensのimport、event.cssの末尾、event-experienceテストは両方の追加を保持。
- 最新mainではPull to Refreshが削除済み。EventScreens、LiveListScreen、MapScheduleScreenの古いuseRefreshTaskは復活させていません。
- 最新mainの更新ボタンは現在のナビゲーションを保持してページを再読込します。旧refreshVisibleDataを呼ぶテストはアンマウント・再マウントによる再取得検証へ変更。実際の更新ボタンと画面保持は既存refresh-button-routingテストで検証。
- 公式サイト、タイトル画面、認証、現在の更新ボタンに対するmainの変更を保持。

## 回帰テスト

92件の異なるテストが成功。UTC・America/Los_Angelesの追加実行42件を含め、計134実行成功。

```sh
TZ=Asia/Tokyo npm exec vitest run tests/admin-device-vote-settings.test.tsx tests/admin-voting-time.test.tsx tests/voting-date-time.test.ts tests/event-experience.test.tsx tests/cancelled-schedules.test.tsx tests/awp-anon-vote.test.ts tests/device-voting-security.test.ts tests/awp-guest-cards.test.ts tests/live-slot.test.ts tests/refresh-button-routing.test.tsx
# 10ファイル、65件成功

TZ=UTC npm exec vitest run tests/admin-device-vote-settings.test.tsx tests/admin-voting-time.test.tsx tests/voting-date-time.test.ts
TZ=America/Los_Angeles npm exec vitest run tests/admin-device-vote-settings.test.tsx tests/admin-voting-time.test.tsx tests/voting-date-time.test.ts
# 各3ファイル、21件成功

npm exec vitest run tests/language-route-stage.test.tsx tests/routing.test.tsx tests/official-site.test.tsx tests/splash-screen.test.tsx
# 4ファイル、27件成功

npm run build
git diff --check
# 成功
```

追加した統合回帰テスト:

- JST開始・終了日時と端末票数を未保存で編集してOPEN/STOPしても、受付状態だけが保存され、フォームの未保存値は残る。
- 続けて明示的に保存すると端末3票とJST日時が保存・再読込で一致。JSTの午前0時がUTCの前日になる場合も確認。
- 端末3票の投票先の一人に中止枠があっても、SUPPORTの3名は保持。中止枠はNOW/NEXT・QUICK PICKS・観たい候補から除外され、時刻表には中止理由を表示。再読込後も同様。

ビルドには500kB超チャンクの警告があります。ルーティング系テストではjsdomのメディアAPI未実装警告が出ますが、全アサーションは成功しています。

## TypeScript

`npm run typecheck`は基準main・統合後ともに22件のエラーで失敗。
同じ依存関係で両方を実行し、診断の行・列番号を除いた全文が完全一致。新規エラーなし。

| ファイル | 既存エラー数 |
| --- | ---: |
| src/catalog/liveCatalog.ts | 1 |
| src/platform/components/GoogleVenueMap.tsx | 1 |
| src/platform/lib/api.ts | 13 |
| src/platform/lib/auth.tsx | 3 |
| src/platform/screens/MapScheduleScreen.tsx | 1 |
| src/platform/screens/PerformerPublicScreen.tsx | 3 |

## 未確認範囲

UI/API境界はモックによる検証です。本番DBの現在の票数設定・受付日時・中止枠、iPhone実機、実投票・実決済は確認していません。DBの値を3票へ書き換える作業は含みません。既存PR #2〜#5は閉じていません。
