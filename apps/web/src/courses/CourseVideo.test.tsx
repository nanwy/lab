import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CourseVideo, type CourseVideoHandle } from './CourseVideo'

const hls = vi.hoisted(() => ({
  handlers: new Map<string, (_: string, data: unknown) => void>(),
  startLoad: vi.fn(),
  recoverMediaError: vi.fn(),
  destroy: vi.fn(),
}))
vi.mock('hls.js', async (original) => {
  const module = await original<typeof import('hls.js')>()
  return {
    ...module,
    default: class {
      static isSupported() {
        return true
      }
      on(event: string, handler: (_: string, data: unknown) => void) {
        hls.handlers.set(event, handler)
      }
      loadSource() {}
      attachMedia() {}
      startLoad = hls.startLoad
      recoverMediaError = hls.recoverMediaError
      destroy = hls.destroy
    },
  }
})

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  hls.handlers.clear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
})

it.each([100, NaN])(
  '缓冲卡顿在末尾或时长未就绪时仍恢复，卸载取消延迟恢复（duration=%s）',
  async (duration) => {
    const { Events, ErrorDetails } = await import('hls.js')
    await act(async () =>
      root.render(
        <CourseVideo
          ref={createRef<CourseVideoHandle>()}
          courseId="one"
          sectionId="first"
          src="/stream.m3u8"
          finished={false}
        />,
      ),
    )
    const video = container.querySelector('video')!
    const play = vi.spyOn(video, 'play').mockResolvedValue()
    Object.defineProperty(video, 'duration', { value: duration })
    video.currentTime = 99.5
    const stalled = () =>
      hls.handlers.get(Events.ERROR)!(Events.ERROR, {
        fatal: false,
        details: ErrorDetails.BUFFER_STALLED_ERROR,
      })
    await act(async () => stalled())
    expect(video.currentTime).toBe(99.5)
    expect(play).toHaveBeenCalledOnce()
    await act(async () => vi.advanceTimersByTime(2000))
    expect(hls.startLoad).toHaveBeenCalledOnce()
    expect(hls.recoverMediaError).toHaveBeenCalledOnce()
    await act(async () => stalled())
    await act(async () => root.render(null))
    await act(async () => vi.advanceTimersByTime(2000))
    expect(hls.startLoad).toHaveBeenCalledOnce()
    expect(hls.recoverMediaError).toHaveBeenCalledOnce()
    expect(hls.destroy).toHaveBeenCalledOnce()
  },
)
