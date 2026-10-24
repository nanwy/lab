import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { Button } from '@workspace/ui/components/button'
import { toast } from '@workspace/ui/components/sonner'
import { ApiError } from '../api'
import {
  contentDownloadName,
  experimentNoteKey,
  exportExperimentNote,
  getExperimentNote,
  saveExperimentNote,
  type ExperimentNote,
} from '../api/experiment-notes'
import { currentUserQueryOptions } from '../auth/session'
import { RichContentEditor } from '../content/RichContentEditor'
import { validateImageSources } from '../content/html'
import { useExperiment } from './ExperimentContext'

export function ExperimentNotes() {
  const experiment = useExperiment()
  const user = useQuery(currentUserQueryOptions())
  if (!user.data) return <p role="status">正在加载账号…</p>
  return (
    <NoteSession
      key={`${user.data.id}:${experiment.id}`}
      account={user.data.id}
      id={experiment.id}
    />
  )
}
function NoteSession({
  account,
  id,
}: {
  account: string | number
  id: string | number
}) {
  const client = useQueryClient()
  const key = experimentNoteKey(account, id)
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getExperimentNote(id, signal),
    retry: false,
  })
  const [draft, setDraft] = useState<{
    content: string
    baseline: string
    noteId: string | number
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const operation = useRef(new AbortController())
  useEffect(() => {
    const controller = new AbortController()
    operation.current = controller
    return () => controller.abort()
  }, [])
  const content = draft?.content ?? query.data?.content ?? ''
  const dirty = draft !== null && draft.content !== draft.baseline
  const blocker = useBlocker({
    shouldBlockFn: () => dirty || busy || uploading,
    enableBeforeUnload: dirty || busy || uploading,
    withResolver: true,
  })
  const showError = (error: unknown) => {
    if (!(
      error instanceof ApiError &&
      (error.handled || error.kind === 'cancelled')
    ))
      toast.error(error instanceof Error ? error.message : '笔记操作失败')
  }
  const save = async () => {
    if (busy || uploading) return
    try {
      validateImageSources(content)
      setBusy(true)
      const saved = await saveExperimentNote(
        id,
        content,
        operation.current.signal,
      )
      if (operation.current.signal.aborted) return
      client.setQueryData(key, saved)
      setDraft((current) => ({
        content:
          current && current.content !== content
            ? current.content
            : saved.content,
        baseline: saved.content,
        noteId: saved.id,
      }))
      toast.success('笔记已保存')
    } catch (error) {
      showError(error)
    } finally {
      if (!operation.current.signal.aborted) setBusy(false)
    }
  }
  const download = async () => {
    if (busy || uploading || !query.data) return
    setBusy(true)
    try {
      const path = await exportExperimentNote(
        id,
        draft?.noteId ?? query.data.id,
        operation.current.signal,
      )
      if (operation.current.signal.aborted) return
      const link = document.createElement('a')
      link.href = path
      link.download = contentDownloadName(path)
      document.body.append(link)
      link.click()
      link.remove()
    } catch (error) {
      showError(error)
    } finally {
      if (!operation.current.signal.aborted) setBusy(false)
    }
  }
  if (query.isPending) return <p role="status">正在加载场景笔记…</p>
  if (query.isError && !draft)
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">场景笔记读取失败</h2>
        {query.error instanceof ApiError && !query.error.handled && (
          <p role="alert">{query.error.message}</p>
        )}
        <Button variant="outline" onClick={() => void query.refetch()}>
          重试笔记
        </Button>
      </section>
    )
  const note = query.data as ExperimentNote
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">场景笔记</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void download()}
            disabled={busy || uploading || !query.data}
          >
            导出 Word
          </Button>
          <Button onClick={() => void save()} disabled={busy || uploading}>
            保存笔记
          </Button>
        </div>
      </header>
      <p className="text-sm text-muted-foreground">
        {dirty
          ? '有未保存的修改；Word 仅导出上次已保存的正文'
          : 'Word 导出使用已保存的正文。'}
      </p>
      <RichContentEditor
        value={content}
        scopeKey={`${account}:${id}`}
        upload={{ mode: 'scene' }}
        onUploadingChange={setUploading}
        onChange={(html) =>
          setDraft((current) => ({
            content: html,
            baseline: current?.baseline ?? note.content,
            noteId: current?.noteId ?? note.id,
          }))
        }
      />
      {blocker.status === 'blocked' && (
        <div className="dialog-backdrop">
          <section
            className="dialog"
            role="alertdialog"
            aria-label="放弃未保存的笔记？"
          >
            <h2>放弃未保存的笔记？</h2>
            <div className="dialog-actions">
              <Button variant="outline" onClick={blocker.reset}>
                留在这里
              </Button>
              <Button variant="destructive" onClick={blocker.proceed}>
                继续离开
              </Button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
