import type { Lang } from '../../i18n'

const messages: Record<Lang, Record<string, string>> = {
  ja: {
    performer_support_unavailable: '現在、このパフォーマーへの応援受付は準備中です。',
    seller_checkout_unavailable: '現在、このパフォーマーのグッズ購入は準備中です。',
    invalid_payment_request: '金額または購入内容を確認してください。',
    product_unavailable: 'この商品は現在購入できません。',
    checkout_failed: '決済画面を準備できませんでした。時間をおいてもう一度お試しください。',
  },
  en: {
    performer_support_unavailable: 'Support payments for this performer are not available yet.',
    seller_checkout_unavailable: 'Merch checkout for this performer is not available yet.',
    invalid_payment_request: 'Please check the amount or purchase details.',
    product_unavailable: 'This product is not currently available.',
    checkout_failed: 'We could not prepare checkout. Please try again shortly.',
  },
  'zh-TW': {
    performer_support_unavailable: '目前尚未開放對此表演者的贊助付款。',
    seller_checkout_unavailable: '目前尚未開放此表演者的商品結帳。',
    invalid_payment_request: '請確認金額或購買內容。',
    product_unavailable: '此商品目前無法購買。',
    checkout_failed: '目前無法準備付款頁面，請稍後再試。',
  },
}

export function paymentErrorMessage(code: string | null | undefined, lang: Lang): string {
  return messages[lang][code || ''] ?? messages[lang].checkout_failed
}
