import { NoteBreakpoint } from './NoteBreakpoint'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@workspace/ui/components/tabs'
import { SharedNotes } from './SharedNotes'
import { ShareToggle } from './ShareToggle'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { ApiError } from '../api'
import { toast } from '@workspace/ui/components/sonner'
import { usePageSignal } from '../auth/use-page-signal'
import { savePersonalNote, exportPersonalNote } from '../api/personal-notes'
import { currentUserQueryOptions } from '../auth/session'
import {
  NoteNameDialog,
  NoteDeleteDialog,
  reportNoteError,
} from './NoteDialogs'
import {
  saveNoteFolder,
  deleteNoteFolder,
  saveNoteMetadata,
  deletePersonalNote,
} from '../api/personal-notes'
import { RichContentEditor } from '../content/RichContentEditor'
import {
  getNoteFolders,
  getPersonalNotes,
  getPersonalNote,
  personalNoteKeys,
  type NoteContext,
  type NoteId,
  type NoteFolder,
} from '../api/personal-notes'
const NoteLeaveContext = createContext<{ current: boolean } | null>(null)
function allowNoteLeave(guard: { current: boolean } | null) {
  if (!guard?.current) return true
  if (
    !window.confirm('有未保存的内容或正在进行的请求，确认离开并丢弃当前编辑？')
  )
    return false
  guard.current = false
  return true
}
export function useNoteSearch(value: string) {
  const [search, setSearch] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSearch(value), 200)
    return () => clearTimeout(timer)
  }, [value])
  return search
}
export function NoteReadError({
  error,
  retry,
}: {
  error: unknown
  retry: () => void
}) {
  return (
    <section className="space-y-2">
      <p>笔记读取失败</p>
      {error instanceof ApiError && !error.handled && (
        <p role="alert">{error.message}</p>
      )}
      <Button variant="outline" onClick={retry}>
        重试读取
      </Button>
    </section>
  )
}
export function PersonalNotesPage() {
  const account = useQuery(currentUserQueryOptions())
  if (!account.data) return <p role="status">正在加载账号…</p>
  return (
    <PersonalNotesSession
      key={String(account.data.id)}
      account={account.data.id}
    />
  )
}
function defaultContext(folders: NoteFolder[]): NoteContext | null {
  const folder = folders[0]
  if (!folder) return null
  if (folder.type > 4)
    return {
      folderId: folder.id,
      courseId: 0,
      type: folder.type,
      ...(folder.courses[0] ? { sectionId: folder.courses[0].id } : {}),
    }
  const course = folder.courses[0]
  return course
    ? { folderId: folder.id, courseId: course.id, type: folder.type }
    : null
}
export function PersonalNotesSession({ account }: { account: NoteId }) {
  const client = useQueryClient()
  const leave = useRef(false)
  function chooseSelection(value: NoteContext) {
    if (allowNoteLeave(leave)) setSelection(value)
  }
  const [dialog, setDialog] = useState<{
    kind: 'create' | 'rename' | 'delete'
    folder?: NoteFolder
  } | null>(null)
  async function refreshFolders() {
    const prefix = ['personal-notes', String(account), 'folders']
    await client.cancelQueries({ queryKey: prefix })
    await client.invalidateQueries({ queryKey: prefix })
  }

  const [search, setSearch] = useState('')
  const debounced = useNoteSearch(search)
  const folders = useQuery({
    queryKey: personalNoteKeys.folders(account, debounced),
    queryFn: ({ signal }) => getNoteFolders(debounced, signal),
    retry: false,
  })
  const [selection, setSelection] = useState<NoteContext | null | undefined>()
  const context =
    selection === undefined ? defaultContext(folders.data ?? []) : selection
  return (
    <NoteLeaveContext.Provider value={leave}>
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">我的笔记</h1>
        {dialog && dialog.kind !== 'delete' && (
          <NoteNameDialog
            title={dialog.kind === 'create' ? '新建文件夹' : '重命名文件夹'}
            initial={dialog.folder?.name}
            close={() => setDialog(null)}
            save={async (name, signal) => {
              await saveNoteFolder(name, dialog.folder?.id, signal)
              if (!signal.aborted) await refreshFolders()
            }}
          />
        )}
        {dialog?.kind === 'delete' && dialog.folder && (
          <NoteDeleteDialog
            description={`是否删除文件夹“${dialog.folder.name}”及其下笔记，删除之后不可恢复！`}
            close={() => setDialog(null)}
            remove={async (signal) => {
              await deleteNoteFolder(dialog.folder!.id, signal)
              if (signal.aborted) return
              if (String(context?.folderId) === String(dialog.folder!.id))
                setSelection(null)
              await refreshFolders()
            }}
          />
        )}
        <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside
            className="space-y-3 rounded-lg border p-3"
            aria-label="笔记目录"
          >
            <Button onClick={() => setDialog({ kind: 'create' })}>
              新建文件夹
            </Button>
            <Input
              aria-label="搜索目录"
              maxLength={300}
              value={search}
              onChange={(e) => {
                if (selection === undefined && context) setSelection(context)
                setSearch(e.target.value)
              }}
            />
            {folders.isPending ? (
              <p role="status">正在加载目录…</p>
            ) : folders.isError ? (
              <NoteReadError
                error={folders.error}
                retry={() => void folders.refetch()}
              />
            ) : !folders.data.length ? (
              <p>暂无目录</p>
            ) : (
              folders.data.map((folder) => (
                <div key={String(folder.id)}>
                  {folder.type <= 4 ? (
                    <details open>
                      <summary>{folder.name}</summary>
                      {folder.courses.length ? (
                        folder.courses.map((course) => (
                          <Button
                            key={String(course.id)}
                            className="w-full justify-start"
                            variant="ghost"
                            onClick={() =>
                              chooseSelection({
                                folderId: folder.id,
                                courseId: course.id,
                                type: folder.type,
                              })
                            }
                          >
                            {course.name}
                          </Button>
                        ))
                      ) : (
                        <p className="p-2 text-sm text-muted-foreground">
                          暂无归档课程
                        </p>
                      )}
                    </details>
                  ) : (
                    <>
                      <Button
                        className="w-full justify-start"
                        variant="ghost"
                        onClick={() =>
                          chooseSelection({
                            folderId: folder.id,
                            courseId: 0,
                            type: folder.type,
                          })
                        }
                      >
                        {folder.name}
                      </Button>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`重命名文件夹 ${folder.name}`}
                          onClick={() => setDialog({ kind: 'rename', folder })}
                        >
                          改名
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`删除文件夹 ${folder.name}`}
                          onClick={() => setDialog({ kind: 'delete', folder })}
                        >
                          删除
                        </Button>
                      </div>
                      {folder.courses.map((section) => (
                        <Button
                          key={String(section.id)}
                          variant="ghost"
                          onClick={() =>
                            chooseSelection({
                              folderId: folder.id,
                              courseId: 0,
                              type: folder.type,
                              sectionId: section.id,
                            })
                          }
                        >
                          {section.name}
                        </Button>
                      ))}
                    </>
                  )}
                </div>
              ))
            )}
          </aside>
          <div className="min-w-0">
            {context ? (
              <NoteWorkspace
                key={JSON.stringify(context)}
                account={account}
                context={context}
              />
            ) : (
              <p>点击目录查看笔记</p>
            )}
          </div>
        </div>
      </section>
    </NoteLeaveContext.Provider>
  )
}
export function NoteWorkspace({
  account,
  context,
}: {
  account: NoteId
  context: NoteContext
}) {
  const leave = useContext(NoteLeaveContext)
  const [tab, setTab] = useState('personal')
  if (context.type > 4)
    return <PersonalNoteList account={account} context={context} />
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (allowNoteLeave(leave)) setTab(value)
      }}
    >
      <TabsList>
        <TabsTrigger value="personal">我的笔记</TabsTrigger>
        <TabsTrigger value="shared">共享笔记</TabsTrigger>
      </TabsList>
      <TabsContent value="personal">
        <PersonalNoteList account={account} context={context} />
      </TabsContent>
      <TabsContent value="shared">
        <SharedNotes accountId={account} scope={context} />
      </TabsContent>
    </Tabs>
  )
}
export function PersonalNoteList({
  account,
  context,
}: {
  account: NoteId
  context: NoteContext
}) {
  const client = useQueryClient()
  const leave = useContext(NoteLeaveContext)
  const [dialog, setDialog] = useState<{
    kind: 'create' | 'rename' | 'delete'
    id?: NoteId
    name?: string
  } | null>(null)
  async function refreshList() {
    const key = personalNoteKeys.list(account, context, debounced)
    await client.cancelQueries({ queryKey: key })
    await client.invalidateQueries({ queryKey: key })
  }

  const [search, setSearch] = useState('')
  const debounced = useNoteSearch(search)
  const list = useQuery({
    queryKey: personalNoteKeys.list(account, context, debounced),
    queryFn: ({ signal }) => getPersonalNotes(context, debounced, signal),
    retry: false,
  })
  const [selected, setSelected] = useState<NoteId>()
  const [preserveSelection, setPreserveSelection] = useState(false)
  const selectedExists = list.data?.some(
    (note) => String(note.id) === String(selected),
  )
  const id =
    list.isSuccess && !selectedExists && !preserveSelection
      ? list.data[0]?.id
      : (selected ?? list.data?.[0]?.id)
  if (selected !== id) setSelected(id)
  const selectedMissing =
    selected !== undefined &&
    list.isSuccess &&
    !list.data.some((note) => String(note.id) === String(selected))
  return (
    <div className="grid gap-4 xl:grid-cols-[13rem_minmax(0,1fr)]">
      {dialog && dialog.kind !== 'delete' && (
        <NoteNameDialog
          title={dialog.kind === 'create' ? '新建笔记' : '重命名笔记'}
          initial={dialog.name}
          close={() => setDialog(null)}
          save={async (name, signal) => {
            const existing =
              dialog.id === undefined
                ? undefined
                : await getPersonalNote(dialog.id, signal)
            await saveNoteMetadata(context, name, existing, signal)
            if (signal.aborted) return
            if (dialog.id !== undefined)
              await client.invalidateQueries({
                queryKey: personalNoteKeys.detail(account, dialog.id),
              })
            await refreshList()
          }}
        />
      )}
      {dialog?.kind === 'delete' && dialog.id !== undefined && (
        <NoteDeleteDialog
          description={`是否删除笔记“${dialog.name}”，删除之后不可恢复！`}
          close={() => setDialog(null)}
          remove={async (signal) => {
            await deletePersonalNote(dialog.id!, signal)
            if (signal.aborted) return
            await client.cancelQueries({
              queryKey: personalNoteKeys.detail(account, dialog.id!),
            })
            client.removeQueries({
              queryKey: personalNoteKeys.detail(account, dialog.id!),
            })
            await refreshList()
            if (String(id) === String(dialog.id)) setSelected(undefined)
          }}
        />
      )}

      <aside
        className="space-y-3 rounded-lg border p-3"
        aria-label="个人笔记列表"
      >
        <Input
          aria-label="搜索笔记"
          maxLength={300}
          value={search}
          onChange={(e) => {
            if (allowNoteLeave(leave)) setSearch(e.target.value)
          }}
        />
        {context.type > 4 && (
          <Button onClick={() => setDialog({ kind: 'create' })}>
            新建笔记
          </Button>
        )}
        {list.isPending ? (
          <p role="status">正在加载笔记列表…</p>
        ) : list.isError ? (
          <NoteReadError error={list.error} retry={() => void list.refetch()} />
        ) : list.data.length ? (
          list.data.map((note) => (
            <div key={String(note.id)} className="space-y-1">
              <Button
                className="w-full justify-start"
                variant={String(id) === String(note.id) ? 'secondary' : 'ghost'}
                onClick={() => {
                  if (allowNoteLeave(leave)) setSelected(note.id)
                }}
              >
                {note.name}
              </Button>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`重命名笔记 ${note.name}`}
                  onClick={() =>
                    setDialog({ kind: 'rename', id: note.id, name: note.name })
                  }
                >
                  改名
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`删除笔记 ${note.name}`}
                  onClick={() =>
                    setDialog({ kind: 'delete', id: note.id, name: note.name })
                  }
                >
                  删除
                </Button>
              </div>
            </div>
          ))
        ) : (
          <p>暂无笔记</p>
        )}
      </aside>
      <div className="min-w-0">
        {selectedMissing && (
          <p role="status">
            当前笔记已不在列表中，草稿仍保留；选择其他笔记前会确认离开。
          </p>
        )}
        {id !== undefined ? (
          <PersonalNoteEditor
            key={String(id)}
            account={account}
            context={context}
            noteId={id}
            onProtectionChange={setPreserveSelection}
          />
        ) : (
          <p>暂无详情</p>
        )}
      </div>
    </div>
  )
}
export function PersonalNoteEditor({
  account,
  context,
  noteId,
  onProtectionChange,
}: {
  account: NoteId
  context: NoteContext
  noteId: NoteId
  onProtectionChange: (protectedSession: boolean) => void
}) {
  const client = useQueryClient()
  const leave = useContext(NoteLeaveContext)
  const signalForNote = usePageSignal()
  const key = personalNoteKeys.detail(account, noteId)
  const note = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getPersonalNote(noteId, signal),
    retry: false,
  })
  const [draft, setDraft] = useState<{
    content: string
    baseline: string
  } | null>(null)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const savedContent = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const content = draft?.content ?? note.data?.content ?? ''
  const dirty = draft !== null && draft.content !== draft.baseline
  useEffect(() => {
    const protectedSession = dirty || busy || uploading || sharing
    onProtectionChange(protectedSession)
    if (leave) leave.current = protectedSession
    return () => {
      onProtectionChange(false)
      if (leave) leave.current = false
    }
  }, [leave, dirty, busy, uploading, sharing, onProtectionChange])
  const blocker = useBlocker({
    shouldBlockFn: () => dirty || busy || uploading || sharing,
    enableBeforeUnload: dirty || busy || uploading || sharing,
    withResolver: true,
  })

  async function refreshSaved(submitted: string, signal: AbortSignal) {
    try {
      const saved = await getPersonalNote(noteId, signal)
      await client.cancelQueries({ queryKey: key, exact: true })
      if (signal.aborted) return
      client.setQueryData(key, saved)
      setDraft((current) =>
        current && current.content !== submitted
          ? { content: current.content, baseline: saved.content }
          : null,
      )
      setRefreshFailed(false)
      toast.success('笔记已保存')
    } catch (error) {
      if (signal.aborted) return
      setRefreshFailed(true)
      reportNoteError(error, signal)
    }
  }
  async function retryRefresh() {
    if (busy || uploading || sharing || savedContent.current === null) return
    const signal = signalForNote()
    setBusy(true)
    try {
      await refreshSaved(savedContent.current, signal)
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  async function save() {
    if (busy || uploading || sharing || !note.data) return
    const signal = signalForNote()
    const submitted = content
    setBusy(true)
    try {
      await savePersonalNote(noteId, submitted, signal)
      await client.cancelQueries({ queryKey: key, exact: true })
      if (signal.aborted) return
      savedContent.current = submitted
      client.setQueryData(key, { ...note.data, content: submitted })
      setDraft((current) => ({
        content: current?.content ?? submitted,
        baseline: submitted,
      }))
      await refreshSaved(submitted, signal)
    } catch (error) {
      reportNoteError(error, signal)
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  async function download() {
    if (busy || uploading || sharing) return
    const signal = signalForNote()
    setBusy(true)
    try {
      const path = await exportPersonalNote(noteId, signal)
      if (!signal.aborted) window.location.href = `${path}?${Date.now()}`
    } catch (error) {
      reportNoteError(error, signal)
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  if (note.isPending) return <p role="status">正在加载笔记详情…</p>
  if (note.isError && !draft)
    return (
      <NoteReadError error={note.error} retry={() => void note.refetch()} />
    )
  if (!note.data) return null
  return (
    <section className="space-y-3 rounded-lg border p-4">
      {blocker.status === 'blocked' && (
        <div role="alert" className="rounded border p-3">
          <p>当前笔记尚未保存或正在处理，确认离开？</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={blocker.reset}>
              继续编辑
            </Button>
            <Button variant="destructive" onClick={blocker.proceed}>
              丢弃并离开
            </Button>
          </div>
        </div>
      )}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{note.data.name}</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => void download()}
            disabled={busy || uploading || sharing}
          >
            导出 Word
          </Button>
          <Button
            onClick={() => void save()}
            disabled={busy || uploading || sharing}
          >
            保存笔记
          </Button>
        </div>
      </header>
      {refreshFailed && (
        <div role="status" className="space-y-2">
          <p>已保存，内容刷新失败</p>
          <Button
            variant="outline"
            disabled={busy || uploading || sharing}
            onClick={() => void retryRefresh()}
          >
            重新读取已保存内容
          </Button>
        </div>
      )}
      {context.type <= 4 && (
        <ShareToggle
          noteId={noteId}
          share={note.data.share}
          content={content}
          disabled={busy || uploading}
          onBusyChange={setSharing}
          onShared={(share) => {
            client.setQueryData(key, {
              ...note.data,
              share,
              ...(content ? { content } : {}),
            })
            if (content) {
              savedContent.current = content
              setRefreshFailed(false)
              setDraft((current) =>
                current && current.content !== content
                  ? { ...current, baseline: content }
                  : null,
              )
            }
          }}
        />
      )}
      <NoteBreakpoint context={context} note={note.data} />
      <p className="text-sm text-muted-foreground">
        {dirty
          ? '有未保存的修改。Word 导出使用已保存的版本。'
          : 'Word 导出使用已保存的正文。'}
      </p>
      <div inert={sharing}>
        <RichContentEditor
          value={content}
          onChange={(html) =>
            setDraft((current) => ({
              content: html,
              baseline: current?.baseline ?? note.data.content,
            }))
          }
          scopeKey={`${account}:${JSON.stringify(context)}:${noteId}`}
          upload={{ mode: 'notes' }}
          onUploadingChange={setUploading}
        />
      </div>
    </section>
  )
}
