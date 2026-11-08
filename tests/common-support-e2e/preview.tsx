// Isolated UI review: no credentials, payment submission or external services.
window.fetch = async () => { throw new Error('UI QA: network disabled') }
const notice = document.createElement('div')
notice.textContent = 'LIVE応援遷移QA：合成データ。金額選択まで。決済は無効。'
notice.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;padding:4px;background:#fff2a8;color:#111;font-size:11px;pointer-events:none;text-align:center'
document.body.append(notice)
new MutationObserver(() => {
  document.querySelectorAll<HTMLButtonElement>('.pl-tip .pl-btn--tip').forEach(button => { if (!button.disabled) button.disabled = true })
}).observe(document.getElementById('root')!, { childList:true, subtree:true, attributes:true, attributeFilter:['disabled'] })
void import('./harness')
