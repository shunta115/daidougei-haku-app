// @vitest-environment jsdom
import { act, render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { useVideoAspect } from '../src/platform/lib/useVideoAspect'
function Fixture({ ready }: { ready: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const { ratio } = useVideoAspect(ref)
  return <><output>{ratio}</output>{ready ? <video ref={ref} /> : null}</>
}
afterEach(() => { cleanup(); vi.useRealTimers() })
it('attaches metadata listeners when async loading mounts the video and follows track resize', () => {
  vi.useFakeTimers()
  const view = render(<Fixture ready={false} />)
  view.rerender(<Fixture ready />)
  const video = view.container.querySelector('video')!
  Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1920 })
  Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 })
  act(() => vi.advanceTimersByTime(500))
  expect(screen.getByRole('status').textContent).toBe(String(16 / 9))
  Object.defineProperty(video, 'videoWidth', { value: 720 })
  Object.defineProperty(video, 'videoHeight', { value: 1280 })
  act(() => video.dispatchEvent(new Event('resize')))
  expect(screen.getByRole('status').textContent).toBe(String(9 / 16))
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
