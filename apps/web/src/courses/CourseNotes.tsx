import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@workspace/ui/components/button'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { Input } from '@workspace/ui/components/input'
import { toast } from '@workspace/ui/components/sonner'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@workspace/ui/components/tabs'
import {
  getCourseNotes,
  saveCourseNoteMetadata,
  type CourseNoteScope,
} from '../api/courses'
import {
  getPersonalNote,
  savePersonalNote,
  deletePersonalNote,
  exportPersonalNote,
  personalNoteKeys,
  type PersonalNote,
  type NoteId,
} from '../api/personal-notes'
import {
  NoteNameDialog,
  NoteDeleteDialog,
  reportNoteError,
} from '../notes/NoteDialogs'
import { ShareToggle } from '../notes/ShareToggle'
import { NoteBreakpoint } from '../notes/NoteBreakpoint'
import { SharedNoteDetail } from '../notes/SharedNotes'
import { useNoteSearch } from '../notes/PersonalNotesPage'
import { RichContentEditor } from '../content/RichContentEditor'
import { validateImageSources } from '../content/html'
import { usePageSignal } from '../auth/use-page-signal'
import { CourseDialog } from './CourseDialog'
import { CourseError } from './CourseFeedback'

export function CourseNotes({
  scope,
  account,
  videoSection,
  readTime,
  seek,
  close,
}: {
  scope: CourseNoteScope
  account: NoteId
  videoSection: boolean
  readTime: () => number
  seek: (section: NoteId, time: number) => void
  close: () => void
}) {
  const [tab, setTab] = useState('mine')
  return (
    <CourseDialog title="课程笔记" close={close} expandable draggable>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="mine">我的笔记</TabsTrigger>
          <TabsTrigger value="shared">共享笔记</TabsTrigger>
        </TabsList>
        <TabsContent value="mine">
          <CourseNoteList
            key={`${scope.courseId}:${scope.sectionId}:mine`}
            scope={scope}
            account={account}
            shared={false}
            videoSection={videoSection}
            readTime={readTime}
            seek={seek}
          />
        </TabsContent>
        <TabsContent value="shared">
          <CourseNoteList
            key={`${scope.courseId}:${scope.sectionId}:shared`}
            scope={scope}
            account={account}
            shared
            videoSection={videoSection}
            readTime={readTime}
            seek={seek}
          />
        </TabsContent>
      </Tabs>
    </CourseDialog>
  )
}
function CourseNoteList({
  scope,
  account,
  shared,
  videoSection,
  readTime,
  seek,
}: {
  scope: CourseNoteScope
  account: NoteId
  shared: boolean
  videoSection: boolean
  readTime: () => number
  seek: (section: NoteId, time: number) => void
}) {
  const client = useQueryClient()
  const [search, setSearch] = useState('')
  const filter = useNoteSearch(search)
  const [selected, setSelected] = useState<NoteId | null>(null)
  const [creating, setCreating] = useState(false)
  const key = [
    shared ? 'shared-notes' : 'personal-notes',
    String(account),
    'course',
    scope,
    filter,
  ] as const
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getCourseNotes(scope, shared, filter, signal),
    retry: false,
  })
  const current =
    list.data?.find((n) => String(n.id) === String(selected)) ?? list.data?.[0]
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          aria-label={shared ? '搜索共享笔记' : '搜索课程笔记'}
          value={search}
          maxLength={300}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!shared && <Button onClick={() => setCreating(true)}>新建笔记</Button>}
      </div>
      {list.isPending ? (
        <Loading label="正在读取课程笔记…" />
      ) : list.isError ? (
        <CourseError
          title="课程笔记列表读取失败"
          error={list.error}
          retry={() => void list.refetch()}
        />
      ) : !list.data.length ? (
        <p>{shared ? '暂无共享笔记' : '暂无课程笔记'}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
          <nav aria-label="选择课程笔记">
            {list.data.map((n) => (
              <Button
                key={n.id}
                className="w-full justify-start"
                variant={current?.id === n.id ? 'secondary' : 'ghost'}
                onClick={() => setSelected(n.id)}
              >
                {n.name}
              </Button>
            ))}
          </nav>
          {current &&
            (shared ? (
              <SharedNoteDetail
                key={current.id}
                accountId={account}
                noteId={current.id}
                seek={seek}
              />
            ) : (
              <CourseNoteEditor
                key={current.id}
                account={account}
                scope={scope}
                noteId={current.id}
                videoSection={videoSection}
                readTime={readTime}
                seek={seek}
                refresh={() => client.invalidateQueries({ queryKey: key })}
              />
            ))}
        </div>
      )}
      {creating && (
        <NoteNameDialog
          title="新建课程笔记"
          checkpoint={videoSection ? { initial: 0, read: readTime } : undefined}
          close={() => setCreating(false)}
          save={async (name, signal, time) => {
            const result = await saveCourseNoteMetadata(
              scope,
              name,
              false,
              { breakpoint_time: time || '' },
              undefined,
              signal,
            )
            if (signal.aborted) return
            setSelected(result.id)
            await client.invalidateQueries({ queryKey: key })
          }}
        />
      )}
    </div>
  )
}
function CourseNoteEditor({
  account,
  scope,
  noteId,
  videoSection,
  readTime,
  seek,
  refresh,
}: {
  account: NoteId
  scope: CourseNoteScope
  noteId: NoteId
  videoSection: boolean
  readTime: () => number
  seek: (section: NoteId, time: number) => void
  refresh: () => Promise<unknown>
}) {
  const detail = useQuery({
    queryKey: personalNoteKeys.detail(account, noteId),
    queryFn: ({ signal }) => getPersonalNote(noteId, signal),
    retry: false,
  })
  return detail.isPending ? (
    <Loading label="正在读取笔记正文…" />
  ) : detail.isError ? (
    <CourseError
      title="笔记正文读取失败"
      error={detail.error}
      retry={() => void detail.refetch()}
    />
  ) : (
    <CourseNoteContent
      account={account}
      scope={scope}
      note={detail.data}
      videoSection={videoSection}
      readTime={readTime}
      seek={seek}
      refresh={refresh}
    />
  )
}
function CourseNoteContent({
  account,
  scope,
  note,
  videoSection,
  readTime,
  seek,
  refresh,
}: {
  account: NoteId
  scope: CourseNoteScope
  note: PersonalNote
  videoSection: boolean
  readTime: () => number
  seek: (section: NoteId, time: number) => void
  refresh: () => Promise<unknown>
}) {
  const client = useQueryClient()
  const signalForNote = usePageSignal()
  const [content, setContent] = useState(note.content)
  const [busy, setBusy] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const locked = busy || sharing || uploading
  const cache = (changes: Partial<PersonalNote>) =>
    client.setQueryData<PersonalNote>(
      personalNoteKeys.detail(account, note.id),
      (old) => (old ? { ...old, ...changes } : old),
    )
  const extend =
    typeof note.extend === 'object' &&
    note.extend !== null &&
    !Array.isArray(note.extend)
      ? note.extend
      : {}
  const initialTime = Reflect.get(extend, 'breakpoint_time')
  const checkpoint =
    typeof initialTime === 'number' && initialTime > 0 ? initialTime : 0
  async function command(action: (signal: AbortSignal) => Promise<void>) {
    if (locked) return
    const signal = signalForNote()
    setBusy(true)
    try {
      await action(signal)
    } catch (error) {
      reportNoteError(error, signal)
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  return (
    <section aria-label="课程笔记正文" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <LoadingButton
          loading={busy}
          disabled={sharing || uploading}
          onClick={() =>
            void command(async (signal) => {
              validateImageSources(content)
              await savePersonalNote(note.id, content, signal)
              if (signal.aborted) return
              cache({ content })
              toast.success('保存成功')
            })
          }
        >
          保存笔记
        </LoadingButton>
        <Button
          variant="outline"
          disabled={locked}
          onClick={() => setRenaming(true)}
        >
          改名
        </Button>
        <Button
          variant="outline"
          disabled={locked}
          onClick={() => setDeleting(true)}
        >
          删除笔记
        </Button>
        <Button
          variant="outline"
          disabled={locked}
          onClick={() =>
            void command(async (signal) => {
              const url = await exportPersonalNote(note.id, signal)
              if (!signal.aborted)
                window.location.assign(`${url}?${Date.now()}`)
            })
          }
        >
          导出Word
        </Button>
        <ShareToggle
          noteId={note.id}
          share={note.share}
          content={content}
          disabled={busy || uploading}
          onBusyChange={setSharing}
          onShared={(share) =>
            cache({ share, ...(content ? { content } : {}) })
          }
        />
        <NoteBreakpoint note={note} seek={seek} />
      </div>
      <div inert={busy || sharing}>
        <RichContentEditor
          value={content}
          onChange={setContent}
          scopeKey={`${account}:course-note:${note.id}`}
          upload={{ mode: 'notes' }}
          onUploadingChange={setUploading}
        />
      </div>
      {renaming && (
        <NoteNameDialog
          title="修改课程笔记"
          initial={note.name}
          checkpoint={
            videoSection ? { initial: checkpoint, read: readTime } : undefined
          }
          close={() => setRenaming(false)}
          save={async (name, signal, time) => {
            const nextExtend =
              time === checkpoint
                ? note.extend
                : { ...extend, breakpoint_time: time }
            await saveCourseNoteMetadata(
              scope,
              name,
              note.share,
              nextExtend,
              note.id,
              signal,
            )
            if (signal.aborted) return
            cache({ name, extend: nextExtend })
            await refresh()
          }}
        />
      )}
      {deleting && (
        <NoteDeleteDialog
          description={`确定删除笔记“${note.name}”？`}
          close={() => setDeleting(false)}
          remove={async (signal) => {
            await deletePersonalNote(note.id, signal)
            if (!signal.aborted) {
              client.removeQueries({
                queryKey: personalNoteKeys.detail(account, note.id),
              })
              await refresh()
            }
          }}
        />
      )}
    </section>
  )
}
