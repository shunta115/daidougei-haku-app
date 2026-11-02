# LIVE Instagramストーリー共有

## 仕様確認（2026-11-02）

Meta公式「Sharing to Stories」（ページ更新日2026-06-30）をブラウザーで確認。
https://developers.facebook.com/documentation/instagram-platform/sharing-to-stories

公式の直接コンポーザー連携はAndroid implicit intent／iOS native custom URL scheme。
iOS実装にはInfo.plistの設定、UIApplication、Instagram専用キーのUIPasteboard、Facebook App IDが必要。
Web/PWA向けの同等の直接コンポーザーAPIは記載されていない。
Safari/PWAでそのネイティブ連携を再現するURLスキームは使用しない。

Web Share仕様は共有先をユーザー／OSに委ねる。共有先アプリや投稿先Storiesをサイトから指定するAPIはない。
https://www.w3.org/TR/web-share/

## 導線

LIVE画面の「ストーリー」→ URLコピー → 画像を共有（OSの候補にある場合Instagramを選択）。
Instagramがない／画像共有非対応／共有失敗時は「共有画像を保存」、または画像長押しで写真に保存。
Instagramを開き、＋ → ストーリーズ → 写真を選択。「リンク」スタンプにコピーしたURLを貼る。
PNG内URLにはクリック可能なリンク機能がないことを案内する。
保存済みのPNGを後から更新することはできないので、画像には生成日時と「画像作成時点」を明記。

追加サービス・依存パッケージ・課金はなし。Canvasで1080×1920のPNGを端末内で生成。
映像／音声のキャプチャ・LiveKit操作・決済API・DB更新なし。
既存の通常シェアを保持（LINE／メッセージはOSの共有候補）。
画像共有はファイルのみ。URLは別途コピーし、画像とURLの混在で共有候補が絞られるのを避ける。
画像はタップ前に生成し、タップハンドラーから直接navigator.shareを呼ぶ。

## 状態

共有を開く際に読み取り専用で最新配信者状態を確認。
確認中／取得失敗時はLIVE中としない。画面のリアルタイム終了通知で旧画像を直ちに無効化する。
画像生成中は保存・画像共有を提供せず、状態と一致するPNGのみ有効にする。

## 検証記録

自動テスト43件（新規9件＋既存LIVE関連34件）合格。型チェック・Viteビルド合格。
ローカルの共有コンポーネントを実Canvasで表示し、390px幅・URLコピー成功・終了状態の描画を確認。
最新mainの既存LIVE fixture（外部DB・メディア接続なし）でも共有ボタンから開き、390px幅の重なり解消と全画面表示中の共有を確認。
この表示検証はiOS共有シートや実配信を使ったend-to-end検証の代替ではない。
iPhone実機とホーム画面追加PWAはこの作業環境から操作できない。下記は実機確認待ちであり合格扱いにしない。

- Safariとホーム画面追加PWAそれぞれでLIVE画面 → ストーリーを開く。
- URLコピー後、画像共有のInstagram候補／ストーリーズ選択可否を記録（iOS・Instagramのバージョンも記録）。
- Instagramが候補に出ない場合、画像保存／長押し写真保存 → Instagramで画像選択 → リンクスタンプ貼り付け。
- 保存画像の配信者名・LIVE状態・URLと実際の視聴先を確認。
- 共有画面を開いたままLIVE終了 → LIVE終了画像に置換されることを確認。
- 終了後に共有画面を開いてLIVE中が含まれないことを確認。
- 共有キャンセル後も視聴が継続し、再共有可能であることを確認。
- 通常シェアからLINE・メッセージ・URLコピーの回帰確認。
- PWAからInstagramへ切り替え後に復帰し、保存・URLコピーの代替導線が使えることを確認。

本番公開・マージは別途承認。
