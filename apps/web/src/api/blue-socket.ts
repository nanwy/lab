import type { BlueId } from './blue-team'
// 原qxt协议按当前页面独立拥有：60秒心跳，未收到消息时onerror最多4次重连。
export function subscribeBlueSocket(
  task: BlueId,
  blue: BlueId,
  suffix: '' | 'situation_node/',
  receive: (event: unknown) => void,
  status: (message: string | null) => void,
) {
  const url = `${location.protocol === 'http:' ? 'ws:' : 'wss:'}//${location.host}/ws/emulate_task/${encodeURIComponent(task)}/blue_team/${encodeURIComponent(blue)}/${suffix}`
  let socket: WebSocket | undefined,
    disposed = false,
    received = false,
    attempts = 0,
    heartbeat: ReturnType<typeof setInterval> | undefined,
    retry: ReturnType<typeof setTimeout> | undefined
  function clean() {
    clearInterval(heartbeat)
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null
      socket.close()
    }
  }
  function connect() {
    clean()
    socket = new WebSocket(url)
    socket.onopen = () => {
      if (disposed) return
      status(null)
      heartbeat = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ heart: 'HeartBeat' }))
      }, 60000)
    }
    socket.onmessage = (e) => {
      if (disposed) return
      received = true
      try {
        const raw: unknown = JSON.parse(String(e.data))
        receive(raw)
      } catch {
        status('实时消息不是有效JSON')
      }
    }
    socket.onerror = () => {
      if (disposed || retry) return
      clearInterval(heartbeat)
      status('实时连接失败')
      if (received || attempts >= 4) return
      retry = setTimeout(() => {
        retry = undefined
        if (disposed) return
        if (
          socket &&
          [WebSocket.CONNECTING, WebSocket.OPEN].includes(
            socket.readyState as 0 | 1,
          )
        )
          return
        attempts++
        received = false
        connect()
      }, 4000)
    }
    socket.onclose = () => {
      clearInterval(heartbeat)
      if (!disposed) status('实时连接已关闭')
    }
  }
  connect()
  return () => {
    disposed = true
    clearTimeout(retry)
    clean()
  }
}
