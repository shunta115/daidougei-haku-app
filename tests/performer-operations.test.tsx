// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const fake = vi.hoisted(() => ({
  uploadMerchImage: vi.fn(),
  listSellerMerchProducts: vi.fn(),
  listSellerMerchOrders: vi.fn(),
  listPerformerEventSlots: vi.fn(),
  listPerformerTipTransactions: vi.fn(),
  getTipFeeBps: vi.fn(),
  getMerchFeeBps: vi.fn(),
  fetchPerformerPayoutView: vi.fn(),
  requestPerformerPayout: vi.fn(),
}))

vi.mock('../src/platform/lib/auth', () => ({
  useAuth: () => ({ performer: { id: 'performer-fixture', stage_name: 'テスト Performer' }, user: { id: 'performer-fixture' } }),
}))
vi.mock('../src/platform/lib/api', () => ({
  createMerchCheckout: vi.fn(),
  getMerchProduct: vi.fn(),
  listActiveMerchProducts: vi.fn().mockResolvedValue([]),
  listMyMerchOrders: vi.fn().mockResolvedValue([]),
  listSellerMerchOrders: fake.listSellerMerchOrders,
  listSellerMerchProducts: fake.listSellerMerchProducts,
  saveSellerMerchProduct: vi.fn(),
  uploadMerchImage: fake.uploadMerchImage,
  listPerformerEventSlots: fake.listPerformerEventSlots,
  listPerformerTipTransactions: fake.listPerformerTipTransactions,
  getTipFeeBps: fake.getTipFeeBps,
  getMerchFeeBps: fake.getMerchFeeBps,
  fetchPerformerPayoutView: fake.fetchPerformerPayoutView,
  requestPerformerPayout: fake.requestPerformerPayout,
}))
vi.mock('../src/platform/lib/track', () => ({ trackProductEvent: vi.fn(), useTrackView: vi.fn() }))
vi.mock('../src/i18n/LangProvider', async () => {
  const { t } = await vi.importActual<typeof import('../src/i18n/index')>('../src/i18n/index')
  return {
    useLang: () => ({
      lang: 'ja' as const,
      setLang: vi.fn(),
      t: (key: string, vars?: Record<string, string | number>) => t(key as 'earnTitle', 'ja', vars),
    }),
  }
})

import { PerformerMerchScreen } from '../src/platform/screens/MerchScreens'
import { PerformerEarningsScreen, PerformerScheduleScreen } from '../src/platform/screens/PerformerBusinessScreens'

beforeEach(() => {
  vi.clearAllMocks()
  try { localStorage.setItem('daidougei-lang', 'ja') } catch { /* jsdom */ }
  fake.listSellerMerchProducts.mockResolvedValue([])
  fake.listSellerMerchOrders.mockResolvedValue([])
  fake.listPerformerEventSlots.mockResolvedValue([])
  fake.listPerformerTipTransactions.mockResolvedValue([])
  fake.getTipFeeBps.mockResolvedValue(1500)
  fake.getMerchFeeBps.mockResolvedValue(800)
  fake.fetchPerformerPayoutView.mockResolvedValue({
    minPayoutYen: 10000,
    confirmedSalesYen: 0,
    hakuAvailableYen: 0,
    stripeAvailableYen: 0,
    availableYen: 0,
    pendingYen: 0,
    paidOutYen: 0,
    remainingYen: 10000,
    canPayout: false,
    ledgerReady: true,
    openPayout: null,
  })
  fake.requestPerformerPayout.mockResolvedValue({ ok: true })
  fake.uploadMerchImage.mockResolvedValue('https://cdn.example.test/product.webp')
})

afterEach(() => cleanup())

describe('performer operations', () => {
  it('previews an image immediately and reports when the upload is complete', async () => {
    render(<PerformerMerchScreen onBack={vi.fn()} />)
    await screen.findByText('グッズ管理')
    const file = new File(['image'], 'product.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('商品画像'), { target: { files: [file] } })
    expect(await screen.findByAltText('選択した商品画像のプレビュー')).toBeTruthy()
    await screen.findByText('画像アップロード完了')
    expect(screen.getByText('商品画像をアップロードしました。商品を保存すると登録が完了します。')).toBeTruthy()
  })

  it('shows a clear empty state when the office has not assigned appearances yet', async () => {
    render(<PerformerScheduleScreen onBack={vi.fn()} onLive={vi.fn()} />)
    await screen.findByText('現在登録されている出演予定はありません')
    expect(screen.getByText('運営が出演予定を登録すると、ここに日時と会場が表示されます。')).toBeTruthy()
  })

  it('separates platform fees from Stripe fees and does not invent the bank payout', async () => {
    fake.listPerformerTipTransactions.mockResolvedValue([{
      id: 'tip-1', performer_id: 'performer-fixture', fan_id: 'fan-1', amount_cents: 1000,
      gross_amount_yen: 1000, platform_fee_cents: 100, platform_fee_yen: 100,
      currency: 'jpy', status: 'succeeded', stripe_session_id: 'cs_test', stripe_payment_intent: 'pi_test',
      created_at: '2026-09-25T00:00:00Z', updated_at: '2026-09-25T00:00:00Z',
    }])
    fake.listSellerMerchOrders.mockResolvedValue([{
      id: 'order-1', buyer_id: 'fan-1', seller_id: 'performer-fixture', product_id: 'product-1',
      buyer_display_name: 'ファン', buyer_email: null, checkout_customer_email: null, checkout_customer_name: null,
      checkout_customer_phone: null, checkout_shipping: null, product_name: 'Tシャツ', product_image_url: null,
      unit_price_yen: 2000, quantity: 1, amount_yen: 2000, gross_amount_yen: 2000, currency: 'jpy',
      platform_fee_yen: 200, status: 'succeeded', stripe_session_id: 'cs_merch', stripe_payment_intent: 'pi_merch',
      created_at: '2026-09-25T01:00:00Z', updated_at: '2026-09-25T01:00:00Z',
    }])
    fake.fetchPerformerPayoutView.mockResolvedValue({
      minPayoutYen: 10000,
      confirmedSalesYen: 2460,
      hakuAvailableYen: 2460,
      stripeAvailableYen: 2000,
      availableYen: 2000,
      pendingYen: 0,
      paidOutYen: 0,
      remainingYen: 8000,
      canPayout: false,
      ledgerReady: true,
      openPayout: null,
    })
    render(<PerformerEarningsScreen onBack={vi.fn()} />)
    await waitFor(() => expect((screen.getByRole('button', { name: '出金を申請' }) as HTMLButtonElement).disabled).toBe(true))
    expect(screen.getByText(/あと¥8,000で出金できます/)).toBeTruthy()
    expect(screen.getAllByText(/Stripe実手数料/).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: /Stripeで入金を確認/ })).toBeNull()
  })
})
