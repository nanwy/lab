import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@workspace/ui/components/tabs'
import { SharedNotes } from './SharedNotes'
import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { ApiError } from '../api'
import { currentUserQueryOptions } from '../auth/session'
import { NoteNameDialog, NoteDeleteDialog } from './NoteDialogs'
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
    return { folderId: folder.id, courseId: 0, type: folder.type }
  const course = folder.courses[0]
  return course
    ? { folderId: folder.id, courseId: course.id, type: folder.type }
    : null
}
export function PersonalNotesSession({ account }: { account: NoteId }) {
  const client = useQueryClient()
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
            onChange={(e) => setSearch(e.target.value)}
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
                            setSelection({
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
                        setSelection({
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
                          setSelection({
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
  )
}
export function NoteWorkspace({
  account,
  context,
}: {
  account: NoteId
  context: NoteContext
}) {
  if (context.type > 4)
    return <PersonalNoteList account={account} context={context} />
  return (
    <Tabs defaultValue="personal">
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
  const id = list.data?.some((n) => String(n.id) === String(selected))
    ? selected
    : list.data?.[0]?.id
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
            setSelected(undefined)
            await refreshList()
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
          onChange={(e) => setSearch(e.target.value)}
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
                onClick={() => setSelected(note.id)}
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
        {id !== undefined ? (
          <PersonalNoteEditor
            key={String(id)}
            account={account}
            context={context}
            noteId={id}
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
}: {
  account: NoteId
  context: NoteContext
  noteId: NoteId
}) {
  const note = useQuery({
    queryKey: personalNoteKeys.detail(account, noteId),
    queryFn: ({ signal }) => getPersonalNote(noteId, signal),
    retry: false,
  })
  const [draft, setDraft] = useState<string | null>(null)
  if (note.isPending) return <p role="status">正在加载笔记详情…</p>
  if (note.isError)
    return (
      <NoteReadError error={note.error} retry={() => void note.refetch()} />
    )
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h2 className="font-semibold">{note.data.name}</h2>
      <RichContentEditor
        value={draft ?? note.data.content}
        onChange={setDraft}
        scopeKey={`${account}:${JSON.stringify(context)}:${noteId}`}
        upload={{ mode: 'notes' }}
      />
    </section>
  )
}
