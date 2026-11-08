import { pushEnvironment } from '../lib/pushEnvironment'

/** Original schematic illustrations; no screenshots or third-party artwork. */
export function PushSetupGuide() {
  const env = pushEnvironment()
  return <details className="pl-card"><summary>通知の設定方法・届かないとき</summary>
    <p>好きなパフォーマーのLIVEを見逃さない！通知を許可しなくてもHAKU内の通知は確認できます。</p>
    {env.needsInstall ? <>
      <p>iPhoneではSafariからホーム画面に追加してください。</p>
      <svg viewBox="0 0 360 120" role="img" aria-label="Safariの共有ボタンからホーム画面に追加し、HAKUアイコンを開く手順" style={{ width: '100%', maxWidth: 440 }}>
        <rect x="5" y="5" width="90" height="108" rx="10" fill="none" stroke="currentColor" />
        <path d="M38 70v22h24V70 M50 80V48 M42 57l8-9 8 9" fill="none" stroke="currentColor" strokeWidth="3" />
        <rect x="29" y="40" width="42" height="61" rx="5" fill="none" stroke="#ff5c68" strokeWidth="3" />
        <path d="M105 60h26l-7-7m7 7-7 7" stroke="#ff5c68" fill="none" strokeWidth="3" />
        <rect x="144" y="25" width="100" height="70" rx="7" fill="none" stroke="#ff5c68" strokeWidth="3" />
        <text x="157" y="54" fill="currentColor" fontSize="13">＋ ホーム画面</text><text x="174" y="76" fill="currentColor" fontSize="13">に追加</text>
        <path d="M253 60h26l-7-7m7 7-7 7" stroke="#ff5c68" fill="none" strokeWidth="3" />
        <rect x="294" y="36" width="59" height="49" rx="10" fill="#112b44" stroke="#ff5c68" strokeWidth="3" /><text x="303" y="66" fill="white" fontSize="15">HAKU</text>
      </svg>
      <ol><li>Safariの「共有」を押す</li><li>「ホーム画面に追加」を選ぶ</li><li>ホーム画面のHAKUを起動</li><li>通知画面で受け取りたい通知をONにし、「許可」を押す</li></ol>
    </> : env.denied ? <p role="status">通知が拒否されています。iPhoneは「設定 → 通知 → HAKU」、Androidはブラウザの「サイトの設定 → 通知」から許可を確認してください。集中モードや省電力設定もご確認ください。</p>
      : !env.supported ? <p>このブラウザではPush通知を利用できません。HAKU内通知をご利用ください。AndroidではChromeなどPush対応ブラウザから開いてください。</p>
        : <p>{env.ios ? 'ホーム画面から起動できています。' : 'AndroidではChromeのサイト通知を許可してください。'} 受け取りたいカテゴリをONにすると、必要な場合だけOSの許可画面が開きます。</p>}
    <p>画面の名称や配置はOSのバージョンによって異なります。通知を受け取れない場合は、カテゴリの同意・フォロー状態・受信時間帯もご確認ください。</p>
  </details>
}
