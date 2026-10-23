import { useEffect, useRef, useState } from 'react'
import { Button } from '@workspace/ui/components/button'
import { ApiError } from '../api'
import { uploadFiles } from '../api/file-upload'
import type { FileActionsContext } from './FileDrivePage'
import './file-upload.css'

type UploadState = {
  phase: 'uploading' | 'success' | 'cancelled' | 'failed'
  count: number
  loaded: number
  total: number
  message?: string
}
export function FileUpload({ context }: { context: FileActionsContext }) {
  const input = useRef<HTMLInputElement>(null)
  const active = useRef<AbortController | null>(null)
  const [state, setState] = useState<UploadState | null>(null)
  useEffect(
    () => () => {
      active.current?.abort()
      active.current = null
    },
    [],
  )
  const uploading = state?.phase === 'uploading'
  async function start(files: File[]) {
    if (!files.length || active.current) return
    const controller = new AbortController()
    active.current = controller
    const current = () =>
      active.current === controller && !controller.signal.aborted
    setState({ phase: 'uploading', count: files.length, loaded: 0, total: 0 })
    try {
      const result = await uploadFiles(context.path, files, {
        signal: controller.signal,
        onUploadProgress(progress) {
          if (current())
            setState({ phase: 'uploading', count: files.length, ...progress })
        },
      })
      if (!current()) return
      active.current = null
      setState((previous) =>
        previous
          ? {
              ...previous,
              phase: 'success',
              message: result.message || '上传成功',
            }
          : previous,
      )
      await context.refresh()
    } catch (error) {
      if (!current()) return
      setState((previous) =>
        previous
          ? {
              ...previous,
              phase: 'failed',
              message:
                error instanceof ApiError && error.handled
                  ? '上传未完成，可重新选择文件'
                  : error instanceof Error
                    ? error.message
                    : '上传未完成',
            }
          : previous,
      )
    } finally {
      if (active.current === controller) active.current = null
    }
  }
  const percent =
    state?.phase === 'success'
      ? 100
      : state?.total
        ? Math.min(99, Math.round((state.loaded / state.total) * 100))
        : 0
  return (
    <>
      <Button onClick={() => input.current?.click()} disabled={uploading}>
        ↑ 上传文件
      </Button>
      <input
        ref={input}
        className="file-upload-input"
        type="file"
        multiple
        aria-label="选择上传文件"
        disabled={uploading}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          void start(files)
        }}
      />
      {state ? (
        <aside
          className="file-upload-panel"
          aria-label="文件上传"
          role="status"
        >
          <div className="file-upload-caption">
            <span>INCOMING / 文件入库</span>
            <span>{String(state.count).padStart(2, '0')} 项</span>
          </div>
          <div className="file-upload-heading">
            <strong>
              {state.phase === 'uploading'
                ? '正在上传文件'
                : state.phase === 'success'
                  ? state.message
                  : state.phase === 'cancelled'
                    ? '已取消上传'
                    : '上传未完成'}
            </strong>
            <span>
              {percent}
              <small>%</small>
            </span>
          </div>
          <div
            className="file-upload-track"
            role="progressbar"
            aria-label="上传进度"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <div className="file-upload-detail">
            <span>
              {state.total
                ? `${bytes(state.loaded)} / ${bytes(state.total)}`
                : state.phase === 'uploading'
                  ? '等待传输字节信息'
                  : state.phase === 'success'
                    ? '传输已完成'
                    : '字节信息不可用'}
            </span>
            <span>
              {state.phase === 'uploading'
                ? percent === 99
                  ? '正在等待服务确认'
                  : '请保持页面打开'
                : state.phase === 'success'
                  ? '已归档至当前目录'
                  : state.phase === 'cancelled'
                    ? '可重新选择文件'
                    : state.message}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (uploading) {
                active.current?.abort()
                active.current = null
                setState((previous) =>
                  previous ? { ...previous, phase: 'cancelled' } : previous,
                )
              } else setState(null)
            }}
          >
            {uploading ? '取消上传' : '收起'}
          </Button>
        </aside>
      ) : null}
    </>
  )
}
function bytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 ** 2).toFixed(1)} MB`
}
