// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveStoryShare } from '../src/platform/components/LiveStoryShare'
import { storyStatus } from '../src/platform/lib/liveStory'

const generated = vi.hoisted(() => vi.fn())
vi.mock('../src/platform/lib/liveStory', async importOriginal => ({
  ...await importOriginal<typeof import('../src/platform/lib/liveStory')>(),
  createLiveStory: generated,
}))
const props = { name: '大道芸 HAKU', url: 'https://example.com/?watch=abc', live: true, onClose: vi.fn() }
beforeEach(() => {
  generated.mockReset().mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
  URL.createObjectURL = vi.fn(() => 'blob:story')
  URL.revokeObjectURL = vi.fn()
  Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockResolvedValue(undefined) })
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
})
afterEach(cleanup)

describe('LIVE story sharing', () => {
  it('uses image-only sharing and copies the exact viewing URL separately', async () => {
    render(<LiveStoryShare {...props} />)
    const share = await screen.findByRole('button', { name: '画像を共有（Instagramを選択）' })
    fireEvent.click(screen.getByRole('button', { name: '視聴URLをコピー' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(props.url))
    fireEvent.click(share)
    expect(navigator.share).toHaveBeenCalledWith({ files: [expect.objectContaining({ name: 'haku-live-story.png', type: 'image/png' })] })
    await screen.findByText('投稿が完了していない場合は、Instagramでストーリーを選んでください。')
  })
  it('invalidates a prepared live image immediately when the LIVE ends', async () => {
    const { rerender } = render(<LiveStoryShare {...props} />)
    await screen.findByRole('link', { name: '共有画像を保存' })
    generated.mockImplementationOnce(() => new Promise(() => {}))
    rerender(<LiveStoryShare {...props} live={false} />)
    expect(screen.queryByRole('link', { name: '共有画像を保存' })).toBeNull()
    expect(screen.queryByRole('button', { name: '画像を共有（Instagramを選択）' })).toBeNull()
    expect(generated).toHaveBeenLastCalledWith({ name: props.name, url: props.url, live: false })
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:story')
    expect(storyStatus(false)).toBe('LIVE終了')
    expect(storyStatus(null)).not.toContain('LIVE中')
  })
  it('keeps saving and copy available without file-share support (including standalone)', async () => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined })
    render(<LiveStoryShare {...props} />)
    expect(await screen.findByRole('link', { name: '共有画像を保存' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '画像を共有（Instagramを選択）' })).toBeNull()
    expect(screen.getByText(/写真から投稿できます/)).toBeTruthy()
  })
  it('handles cancellation quietly and genuine errors with the save fallback', async () => {
    vi.mocked(navigator.share).mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'))
    render(<LiveStoryShare {...props} />)
    const share = await screen.findByRole('button', { name: '画像を共有（Instagramを選択）' })
    await act(async () => fireEvent.click(share))
    expect(screen.queryByText(/^画像を長押しして保存し/)).toBeNull()
    vi.mocked(navigator.share).mockRejectedValueOnce(new Error('denied'))
    fireEvent.click(share)
    await screen.findByText('画像を長押しして保存し、Instagramのストーリーで選んでください。')
  })
  it('offers manual URL copy when clipboard is unavailable', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('denied'))
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null)
    render(<LiveStoryShare {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '視聴URLをコピー' }))
    await waitFor(() => expect(prompt).toHaveBeenCalledWith('視聴URLをコピーしてください', props.url))
    prompt.mockRestore()
  })
})

it('places the dialog above viewer stacking contexts and inside native fullscreen', async () => {
  const normal = render(<LiveStoryShare {...props} />)
  await screen.findByRole('link', { name: '共有画像を保存' })
  expect(normal.container.querySelector('[role="dialog"]')).toBeNull()
  expect(document.body.querySelector('[role="dialog"]')).toBeTruthy()
  normal.unmount()
  const fullscreen = document.createElement('div')
  document.body.append(fullscreen)
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: fullscreen })
  try {
    render(<LiveStoryShare {...props} />)
    await screen.findByRole('link', { name: '共有画像を保存' })
    expect(fullscreen.querySelector('[role="dialog"]')).toBeTruthy()
  } finally {
    cleanup()
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
    fullscreen.remove()
  }
})
