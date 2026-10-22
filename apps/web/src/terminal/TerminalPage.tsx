import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { AttachAddon } from '@xterm/addon-attach'
import '@xterm/xterm/css/xterm.css'
import { Button } from '@workspace/ui/components/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@workspace/ui/components/alert-dialog'
import {
  connectTextConsole,
  validateTextConsole,
  type TextConsoleType,
} from '../api/terminal'

const idleMessage = '由于长时间没有操作，连接已断开!'

export function TerminalPage({ type, id }: { type: string; id: string }) {
  try {
    validateTextConsole(type, id)
  } catch (error) {
    return <p role="alert">{(error as Error).message}</p>
  }
  return (
    <TerminalSession
      key={`${type}/${id}`}
      type={type as TextConsoleType}
      id={id}
    />
  )
}

function TerminalSession({ type, id }: { type: TextConsoleType; id: string }) {
  const container = useRef<HTMLDivElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [message, setMessage] = useState('')
  const [closed, setClosed] = useState(false)
  useEffect(() => {
    if (closed) return
    const terminal = new Terminal({
      cols: 118,
      rows: 24,
      cursorBlink: false,
      scrollback: 1000,
      tabStopWidth: 8,
      disableStdin: true,
    })
    terminal.open(container.current!)
    const socket = connectTextConsole(type, id)
    let attach: AttachAddon | undefined
    let heartbeat: ReturnType<typeof setInterval> | undefined
    let finished = false
    function disconnect() {
      clearInterval(heartbeat)
      attach?.dispose()
      terminal.options.disableStdin = true
    }
    function fail(text: string) {
      if (finished) return
      finished = true
      disconnect()
      socket.close()
      setMessage(text)
    }
    socket.onopen = () => {
      if (finished) return
      terminal.options.disableStdin = false
      attach = new AttachAddon(socket)
      terminal.loadAddon(attach)
      terminal.focus()
      heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ heart: 'HeartBeat' }))
      }, 60_000)
    }
    socket.onmessage = (event) => {
      if (event.data === idleMessage) fail(idleMessage)
    }
    socket.onerror = () => fail('连接失败，请确认节点运行状态及会话权限。')
    socket.onclose = () => fail('连接已关闭')
    return () => {
      finished = true
      disconnect()
      socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null
      socket.close()
      terminal.dispose()
    }
  }, [type, id, attempt, closed])
  return (
    <>
      <div
        ref={container}
        id="terminal-container"
        className="min-h-screen overflow-auto bg-black"
        aria-label="文本终端"
      />
      <AlertDialog open={!!message}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>提示</AlertDialogTitle>
            <AlertDialogDescription>{message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setClosed(true)
                setMessage('')
              }}
            >
              关闭连接
            </Button>
            <Button
              onClick={() => {
                setMessage('')
                setAttempt((value) => value + 1)
              }}
            >
              重新连接
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
