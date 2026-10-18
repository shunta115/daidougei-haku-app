// @vitest-environment jsdom
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MerchDetailScreen, PerformerMerchScreen } from '../src/platform/screens/MerchScreens'

const api = vi.hoisted(() => ({
  getMerchProduct: vi.fn(), getPerformer: vi.fn(), createMerchCheckout: vi.fn(), createMerchReservation: vi.fn(),
  listSellerMerchProducts: vi.fn(), listSellerMerchOrders: vi.fn(), saveSellerMerchProduct: vi.fn(),
  uploadMerchImage: vi.fn(), updateMerchOrderHandoff: vi.fn(),
}))

vi.mock('../src/platform/lib/api', () => ({
  ...api,
  listActiveMerchProducts: vi.fn(), listMyMerchOrders: vi.fn(),
}))
vi.mock('../src/platform/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'buyer-1' },
    performer: { id: 'seller-1', is_approved: true },
  }),
}))
vi.mock('../src/i18n/LangProvider', () => ({ useLang: () => ({ lang: 'ja' }) }))
vi.mock('../src/platform/lib/track', () => ({ trackProductEvent: vi.fn(), useTrackView: vi.fn() }))

const product = {
  id: 'product-1', seller_id: 'seller-1', name: 'AWPタオル', description: '会場限定', image_url: null,
  price_yen: 1000, stock: 4, status: 'active', pickup_location: 'ステージ1 物販受付',
  pickup_deadline: '2026-10-10T10:00:00.000Z', reservation_enabled: true,
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
}

describe('event pickup merch UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getMerchProduct.mockResolvedValue(product)
    api.getPerformer.mockResolvedValue({ id: 'seller-1', is_approved: true, stripe_onboarding_complete: true })
    api.createMerchReservation.mockResolvedValue({ orderId: 'order-1', orderNumber: 'R-123456789ABC' })
    api.listSellerMerchProducts.mockResolvedValue([product])
    api.listSellerMerchOrders.mockResolvedValue([{
      id: 'order-1', product_name: 'AWPタオル', amount_yen: 1000, quantity: 1, order_kind: 'cash_reservation',
      order_number: 'R-123456789ABC', fulfillment_status: 'awaiting_pickup', buyer_display_name: '購入者',
      buyer_email: null, checkout_customer_email: null, checkout_customer_name: null, checkout_customer_phone: null,
      created_at: '2026-10-08T00:00:00Z',
    }])
  })

  it('prioritizes cashless purchase and shows all venue pickup terms at phone width', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    render(<MerchDetailScreen productId="product-1" onBack={() => undefined} />)
    expect(await screen.findByText('先にキャッシュレスで支払う')).toBeTruthy()
    expect(screen.getByText('おすすめ')).toBeTruthy()
    expect(screen.getByRole('button', { name: '無料で取り置く' })).toBeTruthy()
    expect(screen.getByText('ステージ1 物販受付')).toBeTruthy()
    expect(screen.getByText('0円（会場で手渡し）')).toBeTruthy()
  })

  it('creates a free reservation and displays the reservation number', async () => {
    render(<MerchDetailScreen productId="product-1" onBack={() => undefined} />)
    fireEvent.click(await screen.findByRole('button', { name: '無料で取り置く' }))
    expect(await screen.findByText('R-123456789ABC')).toBeTruthy()
    expect(api.createMerchReservation).toHaveBeenCalledWith('product-1', 1, expect.any(String))
  })

  it('lets the owning performer mark a waiting order as collected', async () => {
    render(<PerformerMerchScreen onBack={() => undefined} />)
    fireEvent.click(await screen.findByRole('button', { name: '受取完了にする' }))
    await waitFor(() => expect(api.updateMerchOrderHandoff).toHaveBeenCalledWith('order-1', 'fulfill'))
  })
})
