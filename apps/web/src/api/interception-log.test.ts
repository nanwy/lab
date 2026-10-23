import { afterEach, expect, it, vi } from 'vitest'
import { subscribeInterceptionLog } from './interception-log'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('拦截日志使用cid、JSON日志、原心跳和有限重连，销毁释放所有连接和计时器', () => {
  vi.useFakeTimers()
  const sockets: FakeSocket[] = []
  class FakeSocket {
    static OPEN = 1
    readyState = 1
    onopen: (() => void) | null = null
    onerror: (() => void) | null = null
    onclose: (() => void) | null = null
    onmessage: ((event: { data: string }) => void) | null = null
    sent: string[] = []
    closed = false
    constructor(readonly url: string) {
      sockets.push(this)
    }
    send(data: string) {
      this.sent.push(data)
    }
    close() {
      this.closed = true
    }
  }
  vi.stubGlobal('WebSocket', FakeSocket)
  const lines: string[] = []
  const errors: Error[] = []
  const dispose = subscribeInterceptionLog(
    '72',
    (line) => lines.push(line),
    (error) => errors.push(error),
  )
  expect(sockets[0]!.url).toMatch(/\/ws\/traffic_block_log\/72\/$/)
  sockets[0]!.onopen!()
  vi.advanceTimersByTime(60_000)
  expect(sockets[0]!.sent).toEqual(['{"heart":"HeartBeat"}'])
  for (let i = 0; i < 5; i++) {
    sockets.at(-1)!.onerror!()
    vi.advanceTimersByTime(4_000)
  }
  expect(sockets).toHaveLength(5)
  sockets.at(-1)!.onmessage!({ data: '"packet dropped"' })
  expect(lines).toEqual(['packet dropped'])
  sockets.at(-1)!.onmessage!({ data: 'bad-json' })
  expect(errors[0]?.message).toBe('拦截日志不是有效的JSON')
  expect(() =>
    subscribeInterceptionLog(
      'bad',
      () => {},
      () => {},
    ),
  ).toThrow('缺少有效的拦截日志cid')
  dispose()
  expect(sockets.every((socket) => socket.closed)).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
