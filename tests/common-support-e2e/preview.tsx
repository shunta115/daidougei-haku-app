// Static UI review only. No Stripe/Supabase keys or network API are included.
const originalFetch = window.fetch.bind(window)
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href)
  if (url.origin === location.origin && url.pathname === '/api/stripe/tip') {
    return new Response(JSON.stringify({url: `${location.origin}/mock-checkout.html`}), {headers:{'Content-Type':'application/json'}})
  }
  if (url.origin === location.origin && !url.pathname.startsWith('/api/')) return originalFetch(input,init)
  throw new Error('Static QA: external services disabled')
}
const notice=document.createElement('div')
notice.textContent='静的QA Preview：合成データ・模擬Checkoutのみ。実決済は行いません。'
notice.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;padding:4px;background:#fff2a8;color:#111;font-size:11px;pointer-events:none;text-align:center'
document.body.append(notice)
void import('./harness')
