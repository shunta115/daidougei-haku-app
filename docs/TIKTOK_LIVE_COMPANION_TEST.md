# TikTok LIVE × HAKU 応援ページ TEST手順

最終更新: 2026-10-20 / 対象: Issue #74

## 公式仕様の確認結果

- TikTok公式 [Embed Player](https://developers.tiktok.com/docs/en/embed-player) は `https://www.tiktok.com/player/v1/{tiktok_post_id}` 形式の投稿（video / image）を対象としている。LIVE URLやLIVE配信IDの対応は記載されていない。
- 公式 [Embed Videos / oEmbed](https://developers.tiktok.com/docs/en/embed-videos) も投稿動画URLを入力にする仕様である。
- 2026-10-20に許可済み検証URL `https://www.tiktok.com/@quest_tcg/live` を公式oEmbedへ渡した結果は HTTP 400だった。LIVEを投稿動画IDに変換することはできない。
- 同日にLIVE URL本体はHTTP 200を返したが、自動取得では `x-tt-system-error: 3` となった。公式ドキュメントに第三者サイト用LIVEプレーヤーの提供・許可条件がないため、通常ページのiframe埋め込み、非公開API、Cookie流用、映像URL抽出は実施しない。
- TikTok Developerサイトは、未掲載の製品・提携についてログイン後のSupport requestを案内している。HAKU内再生を進めるには、TikTokから第三者Webサイト向けLIVE Player/SDKの書面許可と技術仕様を取得する必要がある。

以上から、現時点の公式な実装は「TikTok公式LIVEを別タブで開く＋HAKUの応援ページに戻って既存投げ銭を使う」方式とする。TikTokの映像、コメント、広告、ギフトUIは変更せず、HAKU側へ取得・再配信しない。

## TEST Preview

共有URLの形式:

```text
https://<preview-host>/live?tiktokLive=quest_tcg&performerId=29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1
```

`performerId` は既存の承認済み `Test Performer` を読み取り確認した値であり、DB更新は行っていない。任意URLの埋め込みやopen redirectを防ぐため、`tiktokLive` はTikTokハンドル文字だけを許可し、アプリ内で `https://www.tiktok.com/@{handle}/live` を生成する。

## iPhone Safari / Mac Safari 実機手順

1. TEST Preview URLをSafariで開く。
2. `@quest_tcg` と「公式外部視聴モード」が表示されることを確認する。
3. 「TikTok LIVEを開く」を押し、公式TikTokのURLが新しいタブ（またはTikTokアプリ）で開くことを確認する。
4. 配信中なら映像・音声・コメント・TikTok GiftsをTikTok側で確認する。配信していない場合は、この項目を「未検証」と記録する。
5. SafariのHAKUタブへ戻り、「HAKUで投げ銭する · Test Performer」を押す。
6. 既存`TipScreen`に遷移し、金額選択まで確認する。実決済はTEST Stripeでのみ行い、本番決済は承認なしに実行しない。
7. 戻る操作で応援ページへ戻り、再度TikTok公式LIVEを開けることを確認する。

## 完了判定

| 条件 | 現在の判定 |
| --- | --- |
| TikTok LIVEがHAKU内で再生 | 未完成（公式LIVE Embed/SDKが未提供） |
| 公式仕様上許可 | HAKU内再生は未確認。公式TikTokへの外部遷移は実装済み |
| HAKU投げ銭へ遷移 | 実装済み。承認済みパフォーマーだけ表示 |

配信中の映像・音声・コメント・Giftsの実機確認は、`@quest_tcg` がLIVE中の時間に人手で行う。コード上の「外部導線＋HAKU投げ銭」完成と、TikTok LIVE実配信中の確認は区別して記録する。

