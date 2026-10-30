# HAKU LIVE 新UI — PR #99 検証記録

## 実アプリへの接続

- `PerformerLiveScreen` の既存LiveKit、カメラ、マイク、方向切替、コメント、FEVER、ギフト、予約通知を再利用。配信中の設定を歯車に収納し、縦画面のコメントを映像上に配置した。
- `LiveWatchScreen` の既存LiveKit、コメント、いいね、フォロー、投げ銭導線を再利用。横画面で映像とコメントを分離した。
- `PlatformApp` が視聴コンポーネントを保持し、アプリ内ミニプレイヤーへ移しても同じLiveKit Roomとvideo/audio要素を使う。閉じるとアンマウントで切断し、LIVE終了通知でも閉じる。
- `/haku-live-immersive-preview.html` は引き続きデザイン試作用の独立ページ。実機能の検証にはVercelのアプリPreviewを使う。

## 自動検証と残る実機検証

- GitHub ActionsのTypeScript、Vitest、production buildを通す。ミニプレイヤーのRoom接続1回・video/audio要素維持・切断、コメント100/1000件流入時の上限をテストする。
- iPhone Safari実機で、縦横の画角、キーボード、ミニプレイヤー中の画面移動・復帰・閉じる、映像と音声、セーフエリア、前後カメラとマイク、LIVE開始終了を確認する。
- TEST配信で別端末の視聴、フォロー・投げ銭画面への遷移、予約通知受信を確認する。実機未確認は完成判定に含めない。
- YouTube CONNECTは既存の公式IFrame Playerを維持し、今回のミニプレイヤー対象はHAKU DIRECTとする。

## 公開境界

Draftのまま維持。本番DB、Stripe、Connect、AWP、main、本番Vercelは変更しない。実機検証後もmainマージと本番デプロイには個別の最終承認が必要。
