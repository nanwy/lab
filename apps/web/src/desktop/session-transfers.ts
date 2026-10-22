import Guacamole from 'guacamole-common-js'
import { z } from 'zod'

export type DirectoryEntry = { name: string; path: string; type: string }
export function createSessionTransfers(
  client: Guacamole.Client,
  callbacks: {
    directory: (path: string, entries: DirectoryEntry[]) => void
    clipboard: (text: string) => void
    error: (message: string) => void
    success: () => void
    uploading: (count: number) => void
  },
) {
  type SessionFilesystem = Omit<Guacamole.Object, 'onbody'> & {
    onbody:
      | ((stream: Guacamole.InputStream, type: string, path: string) => void)
      | null
  }
  let active = true,
    filesystem: SessionFilesystem | null = null,
    requestedPath = '/',
    pending = 0
  const pendingUploads = new Set<() => void>()
  const inputs = new Set<Guacamole.InputStream>(),
    outputs = new Set<Guacamole.OutputStream>()
  function browse(path: string) {
    if (!active || !filesystem) throw new Error('当前会话尚未提供文件系统')
    requestedPath = path
    filesystem.requestInputStream(path)
  }
  client.onfilesystem = (object) => {
    if (!active) return
    // 当前1.5运行时的onbody明确传stream/mimetype/name；修正DefinitelyTyped遗漏的name参数。
    const current = object as SessionFilesystem
    if (filesystem) filesystem.onbody = filesystem.onundefine = null
    filesystem = current
    current.onundefine = () => {
      if (filesystem === current) filesystem = null
    }
    current.onbody = (stream, type, path) => {
      if (!active || filesystem !== current) return
      inputs.add(stream)
      const reader = new Guacamole.BlobReader(stream, type)
      stream.sendAck('OK', 0)
      reader.onend = () => {
        inputs.delete(stream)
        if (!active) return
        const blob = reader.getBlob()
        if (type.includes('stream-index+json')) {
          void blob
            .text()
            .then((text) => {
              if (!active || filesystem !== current || path !== requestedPath)
                return
              const value = z
                .record(z.string(), z.string())
                .safeParse(JSON.parse(text))
              if (!value.success) throw new Error('远端目录响应无效')
              callbacks.directory(
                path,
                Object.entries(value.data).map(([path, type]) => ({
                  path,
                  type,
                  name: path.split('/').at(-1)!,
                })),
              )
            })
            .catch((error) => {
              if (active)
                callbacks.error(
                  error instanceof Error ? error.message : '目录读取失败',
                )
            })
        } else {
          const url = URL.createObjectURL(blob),
            link = document.createElement('a')
          link.href = url
          link.download = path.split('/').at(-1)!
          link.click()
          URL.revokeObjectURL(url)
        }
      }
    }
  }
  client.onclipboard = (stream, type) => {
    if (!active) return
    if (!type.startsWith('text/')) {
      stream.sendAck('仅支持文本剪贴板', 0x100)
      return
    }
    inputs.add(stream)
    const reader = new Guacamole.StringReader(stream)
    let text = ''
    stream.sendAck('OK', 0)
    reader.ontext = (chunk) => {
      if (active) {
        text += chunk
        stream.sendAck('OK', 0)
      }
    }
    reader.onend = () => {
      inputs.delete(stream)
      if (active) callbacks.clipboard(text)
    }
  }
  return {
    browse,
    clipboard(text: string) {
      if (!active) return
      const stream = client.createClipboardStream('text/plain')
      outputs.add(stream)
      const writer = new Guacamole.StringWriter(stream)
      writer.onack = (status) => {
        if (active && status.isError())
          callbacks.error(status.message || '远端拒绝传输')
      }
      writer.sendText(text)
      writer.sendEnd()
      outputs.delete(stream)
    },
    async upload(path: string, file: File) {
      if (!active || !filesystem) throw new Error('当前会话尚未提供文件系统')
      pending++
      callbacks.uploading(pending)
      let stream: Guacamole.OutputStream | undefined
      let complete: (() => void) | undefined
      let ended = false
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        if (!active) return
        stream = filesystem.createOutputStream(
          file.type,
          `${path === '/' ? '' : path}/${file.name}`,
        )
        outputs.add(stream)
        let offset = 0
        await new Promise<void>((resolve, reject) => {
          complete = resolve
          stream!.onack = (status) => {
            if (!active) {
              resolve()
              return
            }
            if (status.isError()) {
              reject(new Error(status.message))
              return
            }
            if (offset >= bytes.length) {
              resolve()
              return
            }
            const chunk = bytes.subarray(offset, offset + 4096)
            offset += chunk.length
            stream!.sendBlob(
              btoa(
                Array.from(chunk, (byte) => String.fromCharCode(byte)).join(''),
              ),
            )
          }
          // dispose时结束本次等待，不能让旧上传阻塞新会话。
          pendingUploads.add(resolve)
        })
        if (active) {
          stream.sendEnd()
          ended = true
          callbacks.success()
          browse(path)
        }
      } finally {
        if (complete) pendingUploads.delete(complete)
        if (stream) {
          stream.onack = null
          if (active && !ended) stream.sendEnd()
          outputs.delete(stream)
        }
        pending--
        if (active) callbacks.uploading(pending)
      }
    },
    dispose() {
      active = false
      client.onclipboard = client.onfilesystem = null
      if (filesystem) filesystem.onbody = filesystem.onundefine = null
      for (const stream of inputs) stream.onblob = stream.onend = null
      for (const stream of outputs) {
        stream.onack = null
        stream.sendEnd()
      }
      for (const resolve of pendingUploads) resolve()
      inputs.clear()
      outputs.clear()
      pendingUploads.clear()
      filesystem = null
    },
  }
}
