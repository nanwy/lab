import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Loading } from '@workspace/ui/components/loading'
import { Button } from '@workspace/ui/components/button'
import {
  addCoursePlay,
  getCourse,
  getCourseCatalog,
  courseSections,
  changeCourseCollection,
  type CourseSection,
  type CourseDetail,
} from '../api/courses'
import { currentUserQueryOptions } from '../auth/session'
import { CourseError, reportCourseError } from './CourseFeedback'
import { CourseNotes } from './CourseNotes'
import { CourseMaterials } from './CourseMaterials'
import { CourseVideo, type CourseVideoHandle } from './CourseVideo'
import { CourseMediaDialog } from './CourseDialog'
import { isOfficeFile } from '../api/files'
import { CourseComments } from './CourseComments'
import { RelatedCourses } from './RelatedCourses'
import { usePageSignal } from '../auth/use-page-signal'

export function CourseDetailPage({
  courseId,
  sectionId,
  breakpointTime,
}: {
  courseId: string
  sectionId?: string | number
  breakpointTime?: number
}) {
  const video = useRef<CourseVideoHandle>(null)
  const user = useQuery(currentUserQueryOptions())
  const client = useQueryClient()
  const signalForPage = usePageSignal()
  const detail = useQuery({
    queryKey: ['courses', user.data?.id, courseId, 'detail'],
    queryFn: ({ signal }) => getCourse(courseId, signal),
    retry: false,
  })
  const catalog = useQuery({
    queryKey: ['courses', user.data?.id, courseId, 'catalog'],
    queryFn: ({ signal }) => getCourseCatalog(courseId, signal),
    retry: false,
  })
  const [selected, setSelected] = useState<string | number | undefined>(
    sectionId,
  )
  const [notes, setNotes] = useState(false)
  const [seekTarget, setSeekTarget] = useState<{
    section: string | number
    time: number
  } | null>(
    sectionId !== undefined && breakpointTime
      ? { section: sectionId, time: breakpointTime }
      : null,
  )
  const [materials, setMaterials] = useState(false)
  const [comments, setComments] = useState(false)
  const [related, setRelated] = useState(false)
  const [collecting, setCollecting] = useState(false)
  const [media, setMedia] = useState<{
    src: string
    kind: 'video' | 'lecture'
  } | null>(null)
  const sections = courseSections(catalog.isError ? [] : (catalog.data ?? []))
  const section =
    sections.find((s) => String(s.id) === String(selected)) ?? sections[0]
  const row = (s: CourseSection, index: number) => (
    <Button
      key={s.id}
      variant={s.id === section?.id ? 'secondary' : 'ghost'}
      className="h-auto w-full justify-start whitespace-normal py-3 text-left"
      aria-current={s.id === section?.id ? 'true' : undefined}
      onClick={() => {
        setSelected(s.id)
        setSeekTarget(null)
        setMedia(null)
        if (s.type === 1) {
          const signal = signalForPage()
          void addCoursePlay(courseId, s.id, signal)
            .then(() => {
              if (!signal.aborted) void catalog.refetch()
            })
            .catch((error) => reportCourseError(error, signal))
        }
      }}
    >
      <span>
        {index + 1}. {s.name}
        <span className="mt-1 block text-xs text-muted-foreground">
          {s.video_length ? `时长：${s.video_length} ` : ''}
          {detail.data?.mode === 1
            ? `进度：${((s.finish_rate ?? 0) * 100).toFixed(0)}%${s.type === 1 ? ` 播放次数：${s.play_count ?? 0}` : ''}`
            : s.finish
              ? '完成'
              : '未完成'}
        </span>
      </span>
    </Button>
  )
  async function collect() {
    if (!detail.data || collecting) return
    const signal = signalForPage()
    setCollecting(true)
    const previous = detail.data.is_collect
    try {
      await changeCourseCollection(detail.data.id, previous, signal)
      if (signal.aborted) return
      client.setQueryData<CourseDetail>(
        ['courses', user.data?.id, courseId, 'detail'],
        (old) => (old ? { ...old, is_collect: !previous } : old),
      )
    } catch (error) {
      reportCourseError(error, signal)
    } finally {
      if (!signal.aborted) setCollecting(false)
    }
  }
  return (
    <section
      className="mx-auto max-w-[1366px] space-y-4 p-4"
      aria-label="公开课程详情"
    >
      <Button
        variant="link"
        className="h-auto p-0 text-sm"
        onClick={() => window.history.back()}
      >
        返回公开课程
      </Button>
      {detail.isPending ? (
        <Loading label="正在读取课程详情…" />
      ) : detail.isError ? (
        <CourseError
          title="课程详情读取失败"
          error={detail.error}
          retry={() => void detail.refetch()}
        />
      ) : (
        <header className="rounded border p-5">
          <div className="flex justify-between gap-3">
            <h1 className="text-xl font-semibold">{detail.data.name}</h1>
            <Button
              variant="outline"
              disabled={collecting}
              onClick={() => void collect()}
            >
              {detail.data.is_collect ? '取消收藏' : '收藏'}
            </Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            课程方向：{detail.data.course_direction_list.join('、')} 等级：
            {detail.data.difficulty}星
          </p>
        </header>
      )}
      <div className="grid gap-4 md:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="rounded border p-3">
          <h2 className="mb-3 font-semibold">课程目录</h2>
          {catalog.isPending ? (
            <Loading label="正在读取课程目录…" />
          ) : catalog.isError ? (
            <CourseError
              title="课程目录读取失败"
              error={catalog.error}
              retry={() => void catalog.refetch()}
            />
          ) : !sections.length ? (
            <p>未关联小节</p>
          ) : (
            catalog.data.map((entry, index) =>
              'section' in entry ? (
                <div key={entry.id}>
                  <h3 className="my-2 px-2 text-sm font-semibold">
                    第{index + 1}章 {entry.name}
                  </h3>
                  {entry.section.map(row)}
                </div>
              ) : (
                row(entry, index)
              ),
            )
          )}
        </aside>
        <div className="min-w-0 space-y-4 rounded border p-5">
          {section ? (
            <>
              <h2 className="font-semibold">当前节：{section.name}</h2>
              {section.type === 1 && section.m3u8 ? (
                <CourseVideo
                  key={`${courseId}:${section.id}:${section.m3u8}`}
                  ref={video}
                  courseId={courseId}
                  sectionId={section.id}
                  src={section.m3u8}
                  finished={section.finish === true}
                  breakpointTime={
                    String(section.id) === String(seekTarget?.section)
                      ? seekTarget?.time
                      : undefined
                  }
                />
              ) : null}
              <div key={section.id} className="flex flex-wrap gap-2">
                {section.type === 1 && section.attachment?.lecture ? (
                  <LectureLink
                    src={section.attachment.lecture}
                    open={() =>
                      setMedia({
                        src: section.attachment!.lecture!,
                        kind: 'lecture',
                      })
                    }
                  />
                ) : null}
                {section.attachment?.section_attachment ? (
                  <Button variant="outline" asChild>
                    <a href={section.attachment.section_attachment} download>
                      本节附件
                    </a>
                  </Button>
                ) : null}
                {section.type === 2 && section.attachment?.tool_attachment ? (
                  <Button variant="outline" asChild>
                    <a href={section.attachment.tool_attachment} download>
                      本节工具
                    </a>
                  </Button>
                ) : null}
                {section.type === 2 && section.video_attachment ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setMedia({
                        src: section.video_attachment!,
                        kind: 'video',
                      })
                    }
                  >
                    实验视频
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
      {detail.isSuccess ? (
        <div className="flex gap-2">
          {section ? (
            <Button
              variant="outline"
              onClick={() => {
                video.current?.pauseAndGetTime()
                setNotes(true)
              }}
            >
              笔记
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setMaterials(true)}>
            资料
          </Button>
          <Button variant="outline" onClick={() => setComments(true)}>
            评论
          </Button>
          <Button variant="outline" onClick={() => setRelated(true)}>
            相关课程
          </Button>
        </div>
      ) : null}
      {notes && user.data && section ? (
        <CourseNotes
          scope={{ courseId, sectionId: section.id }}
          account={user.data.id}
          videoSection={section.type === 1}
          readTime={() => video.current?.pauseAndGetTime() ?? 0}
          seek={(id, time) => {
            setSeekTarget({ section: id, time })
            if (String(section.id) === String(id)) video.current?.seek(time)
            else setSelected(id)
          }}
          close={() => setNotes(false)}
        />
      ) : null}
      {materials && user.data ? (
        <CourseMaterials
          courseId={courseId}
          account={user.data.id}
          close={() => setMaterials(false)}
        />
      ) : null}
      {comments && user.data ? (
        <CourseComments
          courseId={courseId}
          account={user.data.id}
          username={user.data.username}
          close={() => setComments(false)}
        />
      ) : null}
      {related && user.data ? (
        <RelatedCourses
          courseId={courseId}
          account={user.data.id}
          close={() => setRelated(false)}
        />
      ) : null}
      {media ? (
        <CourseMediaDialog
          title={media.kind === 'lecture' ? '本节讲义' : '视频播放'}
          src={media.src}
          kind={media.kind}
          close={() => setMedia(null)}
        />
      ) : null}
    </section>
  )
}
function LectureLink({ src, open }: { src: string; open: () => void }) {
  const extension = src.split('.').at(-1)?.toLowerCase()
  if (extension === 'pdf' || extension === 'txt')
    return (
      <Button variant="outline" onClick={open}>
        本节讲义
      </Button>
    )
  if (isOfficeFile(src))
    return (
      <Button variant="outline" asChild>
        <Link
          to="/office/viewer"
          search={{
            filePath: new URL(src, location.origin).href,
            mode: 'view',
          }}
          target="_blank"
        >
          本节讲义
        </Link>
      </Button>
    )
  return (
    <Button variant="outline" asChild>
      <a href={src} target="_blank" rel="noreferrer">
        本节讲义
      </a>
    </Button>
  )
}
