// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import { printQrCard } from '../src/platform/lib/qr'
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn() } }))
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })
const opts = { url: 'https://haku.example/?profile=p', name: '出演者', handle: 'performer' }
function openCard() {
  const doc = document.implementation.createHTMLDocument('')
  const popup = { document: doc, closed: false, opener: window, focus: vi.fn(), print: vi.fn(), close: vi.fn() }
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
  vi.mocked(QRCode.toDataURL).mockResolvedValue('data:image/png;base64,a')
  return popup
}
it('waits for the QR image before printing and leaves a manual retry when printing is suppressed', async () => {
  const popup = openCard()
  popup.print.mockImplementationOnce(() => { throw new Error('suppressed') })
  const result = printQrCard(opts)
  await vi.waitFor(() => expect(popup.document.querySelector('img')).not.toBeNull())
  expect(popup.print).not.toHaveBeenCalled()
  popup.document.querySelector('img')!.dispatchEvent(new Event('load'))
  await result
  const retry = popup.document.querySelector('button')!
  expect(retry.disabled).toBe(false)
  retry.click()
  expect(popup.print).toHaveBeenCalledTimes(2)
  expect(popup.opener).toBeNull()
})
it('closes an unusable popup and reports image failures', async () => {
  const popup = openCard()
  const result = printQrCard(opts)
  const rejected = expect(result).rejects.toThrow('qr_print_image')
  await vi.waitFor(() => expect(popup.document.querySelector('img')).not.toBeNull())
  popup.document.querySelector('img')!.dispatchEvent(new Event('error'))
  await rejected
  expect(popup.close).toHaveBeenCalled()
  expect(popup.print).not.toHaveBeenCalled()
})
it('reports a blocked popup without generating the QR', async () => {
  openCard()
  vi.mocked(window.open).mockReturnValue(null)
  vi.mocked(QRCode.toDataURL).mockClear()
  await expect(printQrCard(opts)).rejects.toThrow('popup_blocked')
  expect(QRCode.toDataURL).not.toHaveBeenCalled()
})
it('bounds image readiness so the original page can recover from a stalled load', async () => {
  vi.useFakeTimers()
  const popup = openCard()
  const rejected = expect(printQrCard(opts)).rejects.toThrow('qr_print_timeout')
  await vi.waitFor(() => expect(popup.document.querySelector('img')).not.toBeNull())
  await vi.advanceTimersByTimeAsync(15_000)
  await rejected
  expect(popup.close).toHaveBeenCalled()
})
