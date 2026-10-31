# 全パフォーマー共通・匿名投げ銭監査（2026-10-31）

状態: 修正候補。決済E2Eと実機確認未完了。公開不可。
基点: main 1b01ba21f89d6cb62c36cde2f75da4750d98b5e9。
既存Desktop作業フォルダは変更せず、独立コピーで実装。

## 1. HARIBOW修正の特定

[Draft PR #107](https://github.com/shunta115/daidougei-haku-app/pull/107)、head 2b278c92dcef841cebc1c0dc4938715f97be8978、base 850424a5e3efdb17d7a9506a840288d4aeeb9955。監査時点でopen/draft/未マージ。
変更対象は共通LiveWatchScreenとlive.css。HARIBOWの名前・IDの分岐はなく、専用修正ではない。一方、未マージのためmainに修正が存在しない。
#100は配信ライフサイクル、#109/#111はMAP/出演予定で、匿名Checkout修正ではない。
今回、#107のタップ透過・匿名導線修正を最新基点へ独立して取り込み、連打と非同期出演者切替を追加修正した。#107自体は変更していない。

## 2. 原因と証拠の限界

再現できた共通欠陥:
- phone-portraitのstageは独立stacking contextで、その兄弟コメントpanelが上にある。透明なpaddingが応援ボタンを覆う。elementFromPointで旧CSSの遮断と新CSSの到達を確認。
- 下部応援ボタンだけ未ログイン時に認証へ分岐。右側ボタンと同じonTip経路へ統一。
- TipScreenはReact stateだけでbusyを管理し、同じイベントターンの連打に同期ロックがない。refで送信を一つにし、送信中の金額変更を止めた。
- getPerformerの古い応答が別出演者へ切替後に反映され得た。cancelledフラグとID一致による受付判定を追加。

ポールの当該端末操作がどの欠陥に当たったかは未確定。障害時のVercelリクエストを取得できず、上記の再現だけで当該失敗を断定しない。

## 3. 本番READ ONLY監査

本番Supabaseの公開出演者は23名。PAUL(ポール)・HARIBOWは両方approved=true、profiles.status=active、Connect紐付けあり、onboarding_complete=true。現在値であり、障害時のStripe capabilitiesは証明しない。口座ID、顧客情報、金額明細、認証トークンは保存していない。
実anonロールのREAD ONLYトランザクションで、両者の公開performers SELECTを確認。performers/profiles/live_sessions/tipsはRLS有効。匿名クライアントのtips INSERTは不要で、Vercel APIがservice-roleでpendingを作成する。Checkout生成にSupabase RPC/Edge Functionは介在しない。

JST 10/31（UTC 10/30 15:00–10/31 15:00）のSupabaseログをpath/status/role別に集計。performers/live_sessionsの多くは200。tipsに401が1件あったが、リクエスト識別子/出演者との対応は得られておらず、本件原因とは扱わない。空roleをanonと断定しない。
Vercel当日ログはHobby保存期間制限で400。最近のログや他日のログを代替証拠としない。

### 台帳権限に残る別の公開阻害事項

has_table_privilegeでanon/authenticated双方のpublic.tips TRUNCATE=trueを確認。RLSによる通常行の保護とは別の権限であり、露出RPC等を経由した悪用可能性の追加監査と、承認済みの権限是正が必要。実際にTRUNCATEを試していない。通常Data APIから直ちに実行可能と断定しない。本PRで本番権限や台帳を書き換えていない。台帳の安全性を無条件に保証できないため公開判定はNO-GO。

## 4. 共通決済経路と維持した仕様

公開プロフィール/LIVE → performerId指定のTipScreen → /api/stripe/tip → Stripe Checkout → 署名検証Webhook → tips確定 → read-only confirm。
ゲストはAuthorizationなしでgetOptionalAuthUser=null、fan_id=null。ログイン済みはgetUserで照合し、fanId不一致を拒否。無効tokenだけの場合は従来guest扱いだが、UIのfanId付きなら403となる。認証降格で台帳所有権を変更する修正は行っていない。
サーバーは対象performerの承認・profiles.active、整数JPY/最小額/上限100000円を確認し、fee rateはサーバー定数。requestId再利用時はpayer/performer/amount一致を検証し、Stripeの同じ冪等キーを利用。Webhookは台帳のperformer/payer/amount/sessionを照合する。

mainはPlatform separate charge方式。Connect未完了でも承認済みactive出演者への支援は受け付け、後続の送金は既存Connect適格性判定でholdする。投げ銭受付と銀行受取は異なる。未完了を理由に一律Checkout拒否へ変更すると既存金融方針を変えるため実施しない。台帳/15%手数料計算/精算/Webhook/Transfer/返金処理へのコード差分なし。
受付不可の既存ローカライズ案内を維持。プロフィール取得失敗にも案内を表示。実Stripe残高/口座所有者の照合は未完了。

## 5. 検証

WebKitはHARIBOW/PAUL/Other A/Other Bという4種類の隔離fixtureと異なる合成UUIDを使用。実本番出演者の決済ではない。
- iPhone13相当の縦横・匿名/ログイン済み: 旧CSS遮断再現、実タップ、実TipScreen、正しいID/金額/認証header/requestId、模擬Checkout。
- 同期連打、同じIDによる再試行、遅延した旧出演者応答: UI回帰テスト6件成功。
- 既存tip approval/confirmation/payment safety/routing: 83件成功。
- TypeScript成功。build成功（既存chunkサイズ警告）。最初の依存コピーにはleafletが不足して失敗したが、現main対応の既存依存を利用して成功。
- 最終ブラウザ結果はwebkit-result.json参照。
- 全体回帰の最終結果はvalidation.json参照。

未実施: 物理iPhone Safari、Stripeテストカード/実Checkout、署名WebhookからTEST DB確定と出演者帰属までの往復。既存server/stripeTestE2e.tsはTransfer/返金/Payoutを実行するため、本指示の禁止事項に従い使用しない。

## 6. Draft / Previewと承認ゲート

独立Draft PRで審査する。Stripe Sandbox専用設定の場所を確認中。Vercel Preview secretのモードが読取では判別できなかったため、このブランチだけgit.deploymentEnabled=falseで自動配置を抑止。Preview URLは未発行。secretや環境設定は変更していない。自動配置抑止設定は最終統合時にレビューし、未確認環境への配置を有効化しないこと。

公開前に必要:
1. 既存TEST DB・Stripe Sandbox・テストファン/4出演者の設定先を確認。キーをチャット/PRに掲載しない。
2. Transfer/返金/Payoutを行わないテスト経路で、開始→実Checkout→署名Webhook→TEST台帳/出演者一致、キャンセル・連打・改ざん拒否を実証。
3. 実機iPhone Safariと複数出演者の匿名/ログイン済み両方の受入。
4. tips TRUNCATE等の残存権限監査・是正SQLの個別承認（本番DB変更は別承認）。
5. 最終コードレビュー、mainマージの個別承認、本番デプロイの個別承認。Git連携の場合はマージ前に両方を確認。

本番実決済、送金、返金、DB変更、mainマージ、本番デプロイは実施していない。全員共通の実決済E2Eが揃うまで完成としない。
