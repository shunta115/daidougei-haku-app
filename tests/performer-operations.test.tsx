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
}))
vi.mock('../src/platform/lib/track', () => ({ trackProductEvent: vi.fn(), useTrackView: vi.fn() }))

import { PerformerMerchScreen } from '../src/platform/screens/MerchScreens'
import { PerformerEarningsScreen, PerformerScheduleScreen } from '../src/platform/screens/PerformerBusinessScreens'

beforeEach(() => {
  vi.clearAllMocks()
  fake.listSellerMerchProducts.mockResolvedValue([])
  fake.listSellerMerchOrders.mockResolvedValue([])
  fake.listPerformerEventSlots.mockResolvedValue([])
  fake.listPerformerTipTransactions.mockResolvedValue([])
  fake.getTipFeeBps.mockResolvedValue(1000)
  fake.getMerchFeeBps.mockResolvedValue(1000)
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
    render(<PerformerEarningsScreen onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('¥3,000')).toBeTruthy())
    expect(screen.getByText('¥300')).toBeTruthy()
    expect(screen.getByText(/最終的な銀行入金額とは異なる場合があります/)).toBeTruthy()
    expect(screen.getByText(/この金額は受取予定額ではありません/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Stripeで入金を確認/ }).getAttribute('href')).toBe('https://dashboard.stripe.com/')
  })
})
