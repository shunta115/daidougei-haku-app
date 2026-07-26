/**
 * 運営ダッシュ風の開催ステータス（ダミー）。本番は CMS / プッシュと同期。
 */
export function HomeOpsStrip() {
  return (
    <section className="fe-ops" aria-label="開催情報">
      <div className="fe-ops__row">
        <span className="fe-ops__pill fe-ops__pill--ok">通常開催</span>
        <span className="fe-ops__pill fe-ops__pill--warn">一部変更</span>
        <span className="fe-ops__pill fe-ops__pill--rain">雨天対応</span>
      </div>
      <p className="fe-ops__line">
        屋外ステージは小雨決行。クイーンズ前のみ音量レンジ調整。屋内移動枠はアプリ内 LIVE カードで案内します。
      </p>
    </section>
  )
}
