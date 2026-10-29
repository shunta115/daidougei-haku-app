import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const qr = readFileSync('src/platform/lib/qr.ts', 'utf8')
const profile = readFileSync('src/platform/screens/PerformerPublicScreen.tsx', 'utf8')

describe('performer public QR', () => {
  it('uses only the public canonical profile URL and supports save, share, copy, and print', () => {
    expect(profile).toContain('canonicalUrl')
    expect(profile).toContain('shareProfile')
    expect(profile).toContain('copyLink')
    expect(profile).toContain('saveQr')
    expect(profile).toContain('printQr')
    expect(qr).toContain('QRCode.toDataURL(url')
    expect(qr).toContain('popup.print()')
    expect(qr).not.toMatch(/access_token|service_role|password|secret/i)
  })
})
