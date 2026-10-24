import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { toast } from '@workspace/ui/components/sonner'
import { ApiError } from '../api'
import {
  getSharedNotes,
  getSharedNote,
  getNoteScore,
  scoreSharedNote,
  sharedNoteKeys,
} from '../api/shared-notes'
import type { NoteContext, NoteId } from '../api/personal-notes'
import { NoteBreakpoint } from './NoteBreakpoint'
import { RichContentEditor } from '../content/RichContentEditor'
function showError(error: unknown) {
  if (
    error instanceof ApiError &&
    (error.handled || error.kind === 'cancelled')
  )
    return
  toast.error(error instanceof Error ? error.message : '共享笔记操作失败')
}
export function SharedNotes({
  accountId,
  scope,
}: {
  accountId: NoteId
  scope: NoteContext
}) {
  return (
    <SharedSession
      key={JSON.stringify([accountId, scope])}
      accountId={accountId}
      scope={scope}
    />
  )
}
function SharedSession({
  accountId,
  scope,
}: {
  accountId: NoteId
  scope: NoteContext
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<NoteId | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => setFilter(search), 200)
    return () => clearTimeout(timer)
  }, [search])
  const list = useQuery({
    queryKey: sharedNoteKeys.list(accountId, scope, filter),
    queryFn: ({ signal }) => getSharedNotes(scope, filter, signal),
    retry: false,
  })
  const current =
    list.data?.find((item) => String(item.id) === String(selected)) ??
    list.data?.[0]
  if (scope.type > 4) return null
  return (
    <section className="space-y-4" aria-label="共享笔记列表">
      <Input
        aria-label="搜索共享笔记"
        maxLength={300}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {list.isPending ? (
        <p role="status">正在加载共享笔记…</p>
      ) : list.isError ? (
        <ReadError
          title="共享笔记列表读取失败"
          error={list.error}
          retry={() => void list.refetch()}
        />
      ) : !list.data.length ? (
        <p>暂无共享笔记</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
          <nav className="space-y-2" aria-label="选择共享笔记">
            {list.data.map((item) => (
              <Button
                key={item.id}
                variant={current?.id === item.id ? 'secondary' : 'ghost'}
                className="w-full justify-start"
                onClick={() => setSelected(item.id)}
              >
                {item.name}
              </Button>
            ))}
          </nav>
          {current && (
            <SharedDetail
              key={String(current.id)}
              accountId={accountId}
              scope={scope}
              noteId={current.id}
            />
          )}
        </div>
      )}
    </section>
  )
}
function ReadError({
  title,
  error,
  retry,
}: {
  title: string
  error: unknown
  retry: () => void
}) {
  return (
    <section className="space-y-2">
      <p>{title}</p>
      {error instanceof ApiError && !error.handled && (
        <p role="alert">{error.message}</p>
      )}
      <Button variant="outline" onClick={retry}>
        重试{title.replace('读取失败', '')}
      </Button>
    </section>
  )
}
function SharedDetail({
  accountId,
  noteId,
  scope,
}: {
  accountId: NoteId
  noteId: NoteId
  scope: NoteContext
}) {
  const client = useQueryClient()
  const detail = useQuery({
    queryKey: sharedNoteKeys.detail(accountId, noteId),
    queryFn: ({ signal }) => getSharedNote(noteId, signal),
    retry: false,
  })
  const score = useQuery({
    queryKey: sharedNoteKeys.score(accountId, noteId),
    queryFn: ({ signal }) => getNoteScore(noteId, signal),
    retry: false,
  })
  const [busy, setBusy] = useState(false)
  const operation = useRef(new AbortController())
  useEffect(() => {
    const controller = new AbortController()
    operation.current = controller
    return () => controller.abort()
  }, [])
  const submit = async (value: number) => {
    if (busy) return
    setBusy(true)
    try {
      await scoreSharedNote(noteId, value, operation.current.signal)
      if (operation.current.signal.aborted) return
      await client.cancelQueries({
        queryKey: sharedNoteKeys.score(accountId, noteId),
      })
      client.setQueryData(sharedNoteKeys.score(accountId, noteId), value)
      await client.invalidateQueries({
        queryKey: sharedNoteKeys.detail(accountId, noteId),
      })
      if (!operation.current.signal.aborted) toast.success('评分成功')
    } catch (error) {
      showError(error)
    } finally {
      if (!operation.current.signal.aborted) setBusy(false)
    }
  }
  return (
    <section className="space-y-4" aria-label="共享笔记正文">
      {detail.isPending ? (
        <p role="status">正在加载共享正文…</p>
      ) : detail.isError ? (
        <ReadError
          title="共享正文读取失败"
          error={detail.error}
          retry={() => void detail.refetch()}
        />
      ) : (
        <>
          <div>
            推荐度：
            <span aria-label="推荐度">{detail.data.synthesis_score} / 5</span>
          </div>
          <NoteBreakpoint context={scope} note={detail.data} />
          <RichContentEditor
            value={detail.data.content}
            scopeKey={`${accountId}:shared:${noteId}`}
            readOnly
          />
        </>
      )}
      {score.isPending ? (
        <p role="status">正在加载您的评分…</p>
      ) : score.isError ? (
        <ReadError
          title="个人评分读取失败"
          error={score.error}
          retry={() => void score.refetch()}
        />
      ) : (
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="您的评分"
        >
          <span>您的评分</span>
          {[1, 2, 3, 4, 5].map((value) => (
            <Button
              key={value}
              variant={score.data >= value ? 'secondary' : 'outline'}
              aria-label={`评${value}星`}
              aria-pressed={score.data === value}
              disabled={busy || !detail.data || detail.isError}
              onClick={() => void submit(value)}
            >
              ★
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}
