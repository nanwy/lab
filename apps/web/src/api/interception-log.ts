import { ApiError } from './client'
// 原日志连接按cid独立：60秒心跳；未收到日志时最多4次onerror重连。
export function subscribeInterceptionLog(
  cid: string | number,
  receive: (line: string) => void,
  error: (error: Error) => void,
) {
  if (!String(cid).trim() || !Number.isFinite(Number(cid)))
    throw new ApiError('invalid-response', '缺少有效的拦截日志cid')
  let socket: WebSocket
  let disposed = false
  let received = false
  let attempts = 0
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  const url = `${location.protocol === 'http:' ? 'ws:' : 'wss:'}//${location.host}/ws/traffic_block_log/${encodeURIComponent(Number(cid))}/`
  function cleanupSocket() {
    clearInterval(heartbeat)
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null
      socket.close()
    }
  }
  function connect() {
    cleanupSocket()
    socket = new WebSocket(url)
    socket.onopen = () => {
      clearInterval(heartbeat)
      heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ heart: 'HeartBeat' }))
      }, 60_000)
    }
    socket.onmessage = (event) => {
      received = true
      try {
        const line: unknown = JSON.parse(String(event.data))
        receive(typeof line === 'string' ? line : JSON.stringify(line))
      } catch {
        error(new ApiError('invalid-response', '拦截日志不是有效的JSON'))
      }
    }
    socket.onerror = () => {
      if (disposed || received || attempts >= 4 || retry) return
      retry = setTimeout(() => {
        retry = undefined
        if (!disposed) {
          attempts += 1
          connect()
        }
      }, 4_000)
    }
    socket.onclose = () => clearInterval(heartbeat)
  }
  connect()
  return () => {
    disposed = true
    clearTimeout(retry)
    cleanupSocket()
  }
}
