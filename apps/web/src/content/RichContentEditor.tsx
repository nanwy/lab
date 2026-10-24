import { useEffect, useRef, useState, type AriaAttributes } from 'react'
import Quill, { Delta } from 'quill'
import BlotFormatter from '@enzedonline/quill-blot-formatter2'
import { Button } from '@workspace/ui/components/button'
import Viewer from 'viewerjs'
import 'viewerjs/dist/viewer.css'
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
  id?: string
  name?: string
  onBlur?: () => void
  'aria-invalid'?: AriaAttributes['aria-invalid']
  value: string
  onChange?: (html: string) => void
  scopeKey: string
  upload?: ContentUpload
  readOnly?: boolean
  onUploadingChange?: (busy: boolean) => void
}

export function RichContentEditor(props: RichContentEditorProps) {
  return <ContentSession key={props.scopeKey} {...props} />
}
function ContentSession({
  id,
  name,
  onBlur,
  'aria-invalid': ariaInvalid,
  value,
  onChange,
  scopeKey,
  upload,
  readOnly = false,
  onUploadingChange,
}: RichContentEditorProps) {
  const section = useRef<HTMLElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const quill = useRef<Quill | null>(null)
  const callbacks = useRef({ onChange, onUploadingChange })
  const lastValue = useRef(value)
  const [full, setFull] = useState(false)
  const previewHost = useRef<HTMLDivElement>(null)
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
    const labels: Record<string, string> = {
      bold: '粗体',
      italic: '斜体',
      underline: '下划线',
      strike: '删除线',
      blockquote: '引用',
      'code-block': '代码块',
      list: '列表',
      indent: '缩进',
      script: '上下标',
      image: '插入图片',
      direction: '文字方向',
      clean: '清除格式',
      header: '标题级别',
      color: '文字颜色',
      background: '背景颜色',
      align: '对齐',
    }
    for (const button of container.querySelectorAll<HTMLButtonElement>(
      '.ql-toolbar button',
    )) {
      button.type = 'button'
      const format = Array.from(button.classList)
        .find((name) => name.startsWith('ql-'))
        ?.slice(3)
      const label = format && labels[format]
      if (label) {
        button.setAttribute(
          'aria-label',
          `${label}${button.value ? ' ' + button.value : ''}`,
        )
        button.title = label
      }
    }
    for (const picker of container.querySelectorAll<HTMLElement>(
      '.ql-picker',
    )) {
      const format = Array.from(picker.classList)
        .find((name) => name !== 'ql-picker' && name.startsWith('ql-'))
        ?.slice(3)
      const label = format && labels[format]
      if (label)
        picker
          .querySelector('.ql-picker-label')
          ?.setAttribute('aria-label', label)
    }
    q.root.setAttribute('role', 'textbox')
    q.root.setAttribute('aria-label', readOnly ? '富文本阅读' : '富文本正文')
    q.root.setAttribute('aria-multiline', 'true')
    if (readOnly) q.root.tabIndex = 0
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
    let filteringPaste = false
    let rejectedImage = false
    q.clipboard.addMatcher('IMG', (node, delta) => {
      if (!filteringPaste) return delta
      try {
        validateImageSources((node as HTMLImageElement).outerHTML)
        return delta
      } catch {
        rejectedImage = true
        return new Delta()
      }
    })
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
      for (const img of Array.from(doc.images)) {
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
            img.remove()
          }
        }
      }
      const range = q.getSelection() ?? { index: 0, length: 0 }
      if (range.length) q.deleteText(range.index, range.length, 'user')
      filteringPaste = true
      rejectedImage = false
      try {
        q.clipboard.dangerouslyPasteHTML(
          range.index,
          sanitizeContent(doc.body.innerHTML),
          'user',
        )
      } finally {
        filteringPaste = false
      }
      if (rejectedImage) toast.error('含有外部图片，请先上传图片后再保存')
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
    const root = quill.current?.root
    if (!root) return
    for (const [attribute, value] of [
      ['id', id],
      ['name', name],
      ['aria-invalid', ariaInvalid],
    ] as const) {
      if (value === undefined) root.removeAttribute(attribute)
      else root.setAttribute(attribute, String(value))
    }
  }, [id, name, ariaInvalid, readOnly, mode, uuid])
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
    const container = previewHost.current
    if (!preview || !container) return
    const returnFocus = quill.current?.root
    const image = document.createElement('img')
    image.src = preview
    image.alt = '正文图片预览'
    image.hidden = true
    container.append(image)
    const viewer = new Viewer(image, {
      container,
      navbar: false,
      navigation: false,
      title: () => '图片预览',
      transition: false,
      toolbar: {
        zoomIn: true,
        zoomOut: true,
        oneToOne: true,
        reset: true,
        rotateLeft: true,
        rotateRight: true,
        flipHorizontal: true,
        flipVertical: true,
      },
      ready() {
        const labels: Record<string, string> = {
          'zoom-in': '放大',
          'zoom-out': '缩小',
          'one-to-one': '原始尺寸',
          reset: '重置',
          'rotate-left': '向左旋转',
          'rotate-right': '向右旋转',
          'flip-horizontal': '水平翻转',
          'flip-vertical': '垂直翻转',
          button: '关闭预览',
        }
        for (const [name, label] of Object.entries(labels)) {
          const button = container.querySelector(`.viewer-${name}`)
          button?.setAttribute('aria-label', label)
          button?.setAttribute('title', label)
        }
      },
      hidden() {
        setPreview(null)
      },
    })
    viewer.show()
    return () => {
      viewer.destroy()
      image.remove()
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
    }
  }, [preview])
  useEffect(() => {
    const element = section.current
    const syncFullscreen = () => setFull(document.fullscreenElement === element)
    const escapeFullscreen = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.fullscreenElement === element)
        void document.exitFullscreen().catch(() => {})
    }
    document.addEventListener('keydown', escapeFullscreen)
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen)
      document.removeEventListener('keydown', escapeFullscreen)
      if (document.fullscreenElement === element)
        void document.exitFullscreen().catch(() => {})
    }
  }, [])
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === section.current)
        await document.exitFullscreen()
      else await section.current?.requestFullscreen()
    } catch {
      toast.error('无法切换全屏，请检查浏览器权限')
    }
  }
  return (
    <section ref={section} className="rich-content">
      {!readOnly && (
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {uploading ? '正在上传图片…' : '支持选择、拖入或粘贴图片'}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void toggleFullscreen()}
          >
            {full ? '退出全屏' : '全屏编辑'}
          </Button>
        </div>
      )}
      <div
        ref={host}
        onBlur={(event) => {
          if (event.target === quill.current?.root) onBlur?.()
        }}
        onClickCapture={(event) => {
          if (!full && event.target instanceof HTMLImageElement) {
            event.preventDefault()
            event.stopPropagation()
            setPreview(event.target.src)
          }
        }}
      />
      <div ref={previewHost} />
    </section>
  )
}
export function RichContentReadOnly({ value }: { value: string }) {
  return <RichContentEditor value={value} scopeKey="read-only" readOnly />
}
