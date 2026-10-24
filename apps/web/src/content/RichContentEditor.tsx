import { useEffect, useRef, useState } from 'react'
import Quill from 'quill'
import BlotFormatter from '@enzedonline/quill-blot-formatter2'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { toast } from '@workspace/ui/components/sonner'
import { ApiError } from '../api'
import { uploadContentImage, type ContentUpload } from '../api/content'
import { sanitizeContent, validateImageSources } from './html'
import 'quill/dist/quill.snow.css'
import 'quill/dist/quill.bubble.css'
import '@enzedonline/quill-blot-formatter2/dist/css/quill-blot-formatter2.css'
import './content.css'

Quill.register('modules/blotFormatter2', BlotFormatter)
const toolbar = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  ['blockquote', 'code-block'],
  [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
  [{ indent: '-1' }, { indent: '+1' }],
  [{ script: 'sub' }, { script: 'super' }],
  ['image'],
  [{ direction: 'rtl' }],
  [{ color: [] }, { background: [] }],
  [{ align: [] }],
  ['clean'],
]
export type RichContentEditorProps = {
  value: string
  onChange?: (html: string) => void
  scopeKey: string
  upload?: ContentUpload
  readOnly?: boolean
  onUploadingChange?: (busy: boolean) => void
}

export function RichContentEditor({
  value,
  onChange,
  scopeKey,
  upload,
  readOnly = false,
  onUploadingChange,
}: RichContentEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const quill = useRef<Quill | null>(null)
  const callbacks = useRef({ onChange, onUploadingChange })
  const lastValue = useRef(value)
  const [full, setFull] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(0)
  useEffect(() => {
    callbacks.current = { onChange, onUploadingChange }
  }, [onChange, onUploadingChange])
  const mode = upload?.mode
  const uuid = upload?.uuid
  useEffect(() => {
    const container = host.current
    if (!container) return
    let active = true
    const requests = new Set<AbortController>()
    const editor = document.createElement('div')
    container.replaceChildren(editor)
    const q = new Quill(editor, {
      theme: readOnly ? 'bubble' : 'snow',
      readOnly,
      modules: {
        toolbar: readOnly
          ? false
          : { container: toolbar, handlers: { image: () => input.click() } },
        ...(readOnly
          ? {}
          : {
              blotFormatter2: {
                image: {
                  allowAltTitleEdit: false,
                  allowCompressor: false,
                  autoHeight: false,
                  linkOptions: { allowLinkEdit: false },
                },
                video: { selector: null },
              },
            }),
      },
    })
    quill.current = q
    q.root.setAttribute('role', 'textbox')
    q.root.setAttribute('aria-label', readOnly ? '富文本阅读' : '富文本正文')
    q.root.setAttribute('aria-multiline', 'true')
    q.clipboard.dangerouslyPasteHTML(
      sanitizeContent(lastValue.current),
      'silent',
    )
    // 载入时不把 Quill 的规范化 HTML 视为用户修改。
    const changed = () => {
      const html = q.root.innerHTML
      lastValue.current = html
      callbacks.current.onChange?.(html)
    }
    q.on('text-change', changed)
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.hidden = true
    input.setAttribute('aria-label', '选择正文图片')
    container.append(input)
    const uploadFile = async (file: File) => {
      if (!mode || readOnly || !active) return
      const controller = new AbortController()
      requests.add(controller)
      setUploading(requests.size)
      callbacks.current.onUploadingChange?.(true)
      const position = q.getSelection()?.index ?? 0
      try {
        const url = await uploadContentImage(file, {
          mode,
          uuid,
          signal: controller.signal,
        })
        if (!active || controller.signal.aborted) return
        validateImageSources(`<img src="${url.replaceAll('"', '&quot;')}">`)
        q.insertEmbed(
          Math.min(position, q.getLength() - 1),
          'image',
          url,
          'user',
        )
        q.setSelection(Math.min(position + 1, q.getLength() - 1), 0, 'silent')
      } catch (error) {
        if (
          active &&
          !(
            error instanceof ApiError &&
            (error.handled || error.kind === 'cancelled')
          )
        )
          toast.error(error instanceof Error ? error.message : '图片上传失败')
      } finally {
        requests.delete(controller)
        if (active) {
          setUploading(requests.size)
          callbacks.current.onUploadingChange?.(requests.size > 0)
        }
      }
    }
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) void uploadFile(file)
      input.value = ''
    }
    const drop = (event: DragEvent) => {
      const file = event.dataTransfer?.files[0]
      if (file) {
        event.preventDefault()
        event.stopImmediatePropagation()
        void uploadFile(file)
      }
    }
    const dragover = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }
    const paste = (event: ClipboardEvent) => {
      const files = event.clipboardData?.files
      const image =
        files &&
        Array.from(files).find((file) => file.type.startsWith('image/'))
      if (image) {
        event.preventDefault()
        event.stopImmediatePropagation()
        void uploadFile(image)
        return
      }
      const html = event.clipboardData?.getData('text/html')
      if (!html) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const embedded: File[] = []
      for (const img of doc.images) {
        const src = img.getAttribute('src') ?? ''
        const match = src.match(/^data:(image\/[\w+.-]+);base64,([\s\S]+)$/)
        if (match) {
          try {
            const bytes = Uint8Array.from(atob(match[2]!), (c) =>
              c.charCodeAt(0),
            )
            embedded.push(
              new File([bytes], `pasted-image.${match[1]!.split('/')[1]}`, {
                type: match[1],
              }),
            )
            img.remove()
          } catch {
            toast.error('粘贴图片无法读取')
            return
          }
        }
      }
      try {
        validateImageSources(doc.body.innerHTML)
      } catch (error) {
        toast.error((error as Error).message)
        return
      }
      const range = q.getSelection() ?? { index: 0, length: 0 }
      if (range.length) q.deleteText(range.index, range.length, 'user')
      q.clipboard.dangerouslyPasteHTML(
        range.index,
        sanitizeContent(doc.body.innerHTML),
        'user',
      )
      for (const file of embedded) void uploadFile(file)
    }
    if (!readOnly) {
      q.root.addEventListener('paste', paste, true)
      q.root.addEventListener('drop', drop, true)
      q.root.addEventListener('dragover', dragover)
    }
    return () => {
      active = false
      for (const controller of requests) controller.abort()
      q.off('text-change', changed)
      q.root.removeEventListener('paste', paste, true)
      q.root.removeEventListener('drop', drop, true)
      q.root.removeEventListener('dragover', dragover)
      if (!readOnly) {
        // formatter2 3.2.0 的 destroy 无条件从 overlay 移除 toolbar；
        // hide 后恢复其父子关系，随后由插件完成所有资源清理（含 StrictMode）。
        const formatter = q.getModule('blotFormatter2') as {
          hide(): void
          destroy(): void
          toolbar: { element: HTMLElement }
          overlay: HTMLElement
        }
        formatter.hide()
        formatter.overlay.append(formatter.toolbar.element)
        formatter.destroy()
      }
      q.disable()
      quill.current = null
      container.replaceChildren()
      callbacks.current.onUploadingChange?.(false)
    }
  }, [scopeKey, mode, uuid, readOnly])
  useEffect(() => {
    lastValue.current = value
    const q = quill.current
    if (q && q.root.innerHTML !== value) {
      // 外部刷新仅在消费者明确替换 value 时生效；本地输入不重建选区/撤销栈。
      if (value !== q.root.innerHTML)
        q.clipboard.dangerouslyPasteHTML(sanitizeContent(value), 'silent')
    }
  }, [value])
  useEffect(() => {
    if (!full) return
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFull(false)
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [full])
  return (
    <section
      className={`rich-content ${full ? 'rich-content-fullscreen' : ''}`}
    >
      {!readOnly && (
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {uploading ? '正在上传图片…' : '支持选择、拖入或粘贴图片'}
          </span>
          <Button variant="outline" size="sm" onClick={() => setFull(!full)}>
            {full ? '退出全屏' : '全屏编辑'}
          </Button>
        </div>
      )}
      <div
        ref={host}
        onDoubleClick={(event) => {
          if (event.target instanceof HTMLImageElement)
            setPreview(event.target.src)
        }}
      />
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogTitle>图片预览</DialogTitle>
          {preview && (
            <img
              className="max-h-[75vh] max-w-full object-contain"
              src={preview}
              alt="正文图片预览"
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
export function RichContentReadOnly({ value }: { value: string }) {
  return <RichContentEditor value={value} scopeKey="read-only" readOnly />
}
