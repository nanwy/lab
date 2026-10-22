import { useEffect, useRef, useState } from 'react'
import Guacamole from 'guacamole-common-js'
import { toast } from '@workspace/ui/components/sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@workspace/ui/components/dialog'
import { ClipboardForm, DesktopFiles } from './DesktopTools'
import {
  createSessionTransfers,
  type DirectoryEntry,
} from './session-transfers'
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
  desktopSocketUrl,
  desktopErrors,
  type DesktopType,
} from '../api/desktop'

const combinations: Array<[string, number[]]> = [
  ['Ctrl+Alt+Delete', [65507, 65513, 65535]],
  ['Ctrl+Alt+Backspace', [65507, 65513, 65288]],
  ['Windows+D', [65515, 100]],
  ['Windows+E', [65515, 101]],
  ['Windows+R', [65515, 114]],
  ['Windows+X', [65515, 120]],
  ['Windows', [65515]],
]
export function DesktopSession({
  type,
  id,
  embedded = false,
}: {
  type: DesktopType
  id: string
  embedded?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const sink = useRef<HTMLTextAreaElement>(null)
  const client = useRef<Guacamole.Client | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [closed, setClosed] = useState(false)
  const [state, setState] = useState(0)
  const [error, setError] = useState('')
  const [keysOpen, setKeysOpen] = useState(false)
  const [tool, setTool] = useState<'clipboard' | 'files' | null>(null)
  const [clipboard, setClipboard] = useState('')
  const [directory, setDirectory] = useState<{
    path: string
    entries: DirectoryEntry[]
  }>({ path: '/', entries: [] })
  const [uploading, setUploading] = useState(0)
  const transfers = useRef<ReturnType<typeof createSessionTransfers> | null>(
    null,
  )
  function report(error: unknown) {
    toast.error(error instanceof Error ? error.message : '会话文件操作失败')
  }
  useEffect(() => {
    if (closed) return
    const target = host.current!
    const tunnel = new Guacamole.WebSocketTunnel(desktopSocketUrl(type, id))
    const session = new Guacamole.Client(tunnel)
    client.current = session
    const display = session.getDisplay()
    const element = display.getElement()
    target.appendChild(element)
    const input = sink.current!
    const keyboard = new Guacamole.Keyboard(input)
    const resetKeys = () => keyboard.reset()
    input.addEventListener('blur', resetKeys)
    window.addEventListener('blur', resetKeys)
    const mouse = new Guacamole.Mouse(element)
    let active = true,
      failed = false,
      connectionState = 0
    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    const fail = (status: Guacamole.Status) => {
      if (!active || failed) return
      failed = true
      let message = desktopErrors[status.code]
      if (!message && status.message) {
        try {
          message = new TextDecoder().decode(
            Uint8Array.from(
              atob(status.message.replace(/-/g, '+').replace(/_/g, '/')),
              (char) => char.charCodeAt(0),
            ),
          )
        } catch {
          message = '未知错误。'
        }
      }
      transfers.current?.dispose()
      setError(message || '未知错误。')
    }
    const transfer = createSessionTransfers(session, {
      directory: (path, entries) => {
        if (active) setDirectory({ path, entries })
      },
      clipboard: (text) => {
        if (!active) return
        setClipboard(text)
        if (navigator.clipboard)
          void navigator.clipboard.writeText(text).catch(() => {
            if (active)
              toast.warning('浏览器拒绝写入剪贴板，可在剪贴板窗口查看。')
          })
      },
      error: (message) => {
        if (active) toast.error(message)
      },
      success: () => {
        if (active) toast.success('上传成功！')
      },
      uploading: (count) => {
        if (active) setUploading(count)
      },
    })
    transfers.current = transfer
    const rootTimer = setTimeout(() => {
      if (active && type === 'rdp') {
        try {
          transfer.browse('/')
        } catch {
          /* 服务器尚未提供文件系统，打开工具时仍可重试。 */
        }
      }
    }, 5000)
    session.onerror = tunnel.onerror = fail
    session.onstatechange = (next) => {
      if (active) {
        connectionState = next
        setState(next)
        if (next === 5 && !failed) setError('连接已关闭')
      }
    }
    keyboard.onkeydown = (key) => {
      if (connectionState === 3) session.sendKeyEvent(1, key)
      return false
    }
    keyboard.onkeyup = (key) => {
      if (connectionState === 3) session.sendKeyEvent(0, key)
    }
    const sendMouse = (event: Guacamole.Event) => {
      if (connectionState === 3)
        session.sendMouseState((event as Guacamole.Mouse.Event).state)
    }
    mouse.onEach(['mousedown', 'mouseup', 'mousemove'], sendMouse)
    const dimensions = () => ({
      width: embedded ? target.clientWidth : window.innerWidth,
      height: embedded ? target.clientHeight : window.innerHeight,
    })
    const resize = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        if (active) {
          const size = dimensions()
          display.scale(1)
          session.sendSize(size.width, size.height)
        }
      }, 1000)
    })
    resize.observe(target)
    const size = dimensions()
    session.connect(
      new URLSearchParams({
        width: String(size.width),
        height: String(size.height),
        dpi: '96',
        scale: '1',
        'resize-method': 'reconnect',
      }).toString(),
    )
    sink.current?.focus()
    return () => {
      active = false
      clearTimeout(resizeTimer)
      clearTimeout(rootTimer)
      transfer.dispose()
      transfers.current = null
      resize.disconnect()
      input.removeEventListener('blur', resetKeys)
      window.removeEventListener('blur', resetKeys)
      keyboard.reset()
      keyboard.onkeydown = keyboard.onkeyup = null
      mouse.off('mousedown', sendMouse)
      mouse.off('mouseup', sendMouse)
      mouse.off('mousemove', sendMouse)
      session.onstatechange = session.onerror = tunnel.onerror = null
      session.disconnect()
      client.current = null
      // 依赖patch补齐Display全局blur监听与动画帧清理。
      ;(display as Guacamole.Display & { destroy(): void }).destroy()
      element.remove()
    }
  }, [type, id, attempt, closed, embedded])
  return (
    <section
      className={
        embedded
          ? 'relative h-full min-h-96 bg-black text-white'
          : 'relative h-screen bg-black text-white'
      }
    >
      <div
        ref={host}
        aria-label="远程桌面"
        className="h-full w-full overflow-auto"
        onClick={() => sink.current?.focus()}
      />
      {!closed ? (
        <textarea
          key={attempt}
          ref={sink}
          aria-label="远程键盘输入"
          onInput={(event) => {
            if (!(event.nativeEvent as InputEvent).isComposing)
              event.currentTarget.value = ''
          }}
          onCompositionEnd={(event) => {
            event.currentTarget.value = ''
          }}
          className="absolute left-0 top-0 h-px w-px opacity-0"
        />
      ) : null}
      <p role="status" className="absolute bottom-1 left-2 text-xs">
        {closed
          ? '连接已关闭'
          : [
              '正在初始化中…',
              '正在初始化中…',
              '正在等待服务器响应…',
              '已连接',
              '正在断开…',
              '连接已关闭',
            ][state]}
      </p>
      <div className="absolute right-3 top-3 flex gap-2">
        {type === 'rdp' ? (
          <>
            <Button
              disabled={state !== 3 || closed}
              onClick={() => setTool('clipboard')}
            >
              剪贴板
            </Button>
            <Button
              disabled={state !== 3 || closed}
              onClick={() => {
                setTool('files')
                try {
                  transfers.current?.browse(directory.path)
                } catch (error) {
                  report(error)
                }
              }}
            >
              文件管理
            </Button>
          </>
        ) : null}
        <Button
          disabled={state !== 3 || closed}
          onClick={() => setKeysOpen(!keysOpen)}
        >
          组合键
        </Button>
        {keysOpen ? (
          <div className="grid bg-background text-foreground">
            {combinations.map(([name, keys]) => (
              <Button
                key={name}
                onClick={() => {
                  if (!client.current || state !== 3 || closed) return
                  for (const key of keys) client.current.sendKeyEvent(1, key)
                  for (const key of keys) client.current.sendKeyEvent(0, key)
                  setKeysOpen(false)
                  sink.current?.focus()
                }}
              >
                {name}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      <Dialog
        open={tool !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTool(null)
          }
        }}
      >
        <DialogContent
          className="max-h-[85vh] overflow-auto"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (!closed && state === 3) sink.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {tool === 'clipboard' ? '剪贴板' : '文件管理'}
            </DialogTitle>
            <DialogDescription>
              {tool === 'clipboard'
                ? '发送文本至当前远端会话'
                : '当前远端会话文件系统'}
            </DialogDescription>
          </DialogHeader>
          {tool === 'clipboard' ? (
            <ClipboardForm
              text={clipboard}
              send={(text) => {
                transfers.current?.clipboard(text)
                setClipboard(text)
                setTool(null)
              }}
            />
          ) : null}
          {tool === 'files' ? (
            <DesktopFiles
              key={directory.path}
              {...directory}
              uploading={uploading}
              browse={(path) => transfers.current!.browse(path)}
              upload={(path, file) => transfers.current!.upload(path, file)}
              report={report}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!error}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>提示</AlertDialogTitle>
            <AlertDialogDescription>{error}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              onClick={() => {
                setClosed(true)
                setTool(null)
                setKeysOpen(false)
                setClipboard('')
                setDirectory({ path: '/', entries: [] })
                setUploading(0)
                setError('')
              }}
            >
              关闭连接
            </Button>
            <Button
              onClick={() => {
                setError('')
                setKeysOpen(false)
                setTool(null)
                setUploading(0)
                setDirectory({ path: '/', entries: [] })
                setClipboard('')
                setAttempt((value) => value + 1)
              }}
            >
              重新连接
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
