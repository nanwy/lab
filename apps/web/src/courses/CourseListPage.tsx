import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Loading } from '@workspace/ui/components/loading'
import { toast } from '@workspace/ui/components/sonner'
import {
  getCourses,
  getCourseFilters,
  initialCourseFilter,
  type CourseFilter,
  type CourseId,
} from '../api/courses'
import { getCourseAvailability } from '../api/portal'
import { getPositions } from '../api/auth'
import { currentUserQueryOptions } from '../auth/session'
import { usePageSignal } from '../auth/use-page-signal'
import { ListPagination } from '../activity/ActivityTable'
import { CourseError, reportCourseError } from './CourseFeedback'

export function CourseListPage() {
  const user = useQuery(currentUserQueryOptions())
  const [filter, setFilter] = useState(initialCourseFilter)
  const [debounced, setDebounced] = useState(filter)
  const [expanded, setExpanded] = useState(true)
  const [entering, setEntering] = useState<CourseId | null>(null)
  const signalForPage = usePageSignal()
  const navigate = useNavigate()
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(filter), 200)
    return () => clearTimeout(timer)
  }, [filter])
  const options = useQuery({
    queryKey: ['courses', 'filters'],
    queryFn: ({ signal }) => getCourseFilters(signal),
    retry: false,
  })
  const positions = useQuery({
    queryKey: ['account', 'positions'],
    queryFn: ({ signal }) => getPositions(signal),
    retry: false,
  })
  const list = useQuery({
    queryKey: ['courses', user.data?.id, 'list', debounced],
    queryFn: ({ signal }) => getCourses(debounced, signal),
    retry: false,
    enabled: !!user.data,
  })
  function toggle(
    key: Exclude<keyof CourseFilter, 'page' | 'size' | 'search'>,
    value: string | number | null,
  ) {
    setFilter((old) => {
      const values = old[key] as (string | number)[]
      return {
        ...old,
        page: 1,
        [key]:
          value === null
            ? []
            : values.includes(value)
              ? values.filter((v) => v !== value)
              : key === 'complete'
                ? [value]
                : [...values, value],
      }
    })
  }
  async function enter(courseId: CourseId) {
    if (entering !== null) return
    const signal = signalForPage()
    setEntering(courseId)
    try {
      const allowed = await getCourseAvailability(courseId, signal)
      if (signal.aborted) return
      if (!allowed.is_open) {
        toast.info('该课程已被关闭')
        return
      }
      await navigate({
        to: '/basic/training/course/$courseId',
        params: { courseId: String(courseId) },
      })
    } catch (error) {
      reportCourseError(error, signal)
    } finally {
      if (!signal.aborted) setEntering(null)
    }
  }
  const groups: {
    label: string
    key: Exclude<keyof CourseFilter, 'page' | 'size' | 'search'>
    values: { id: string | number; name: string }[]
  }[] = [
    {
      label: '课程方向',
      key: 'directions',
      values: (options.data?.course_direction_lists ?? []).map((name) => ({
        id: name,
        name,
      })),
    },
    {
      label: '课程分类',
      key: 'tag',
      values: (options.data?.category_lists ?? []).map((name) => ({
        id: name,
        name,
      })),
    },
    { label: '适合岗位', key: 'position', values: positions.data ?? [] },
    {
      label: '课程等级',
      key: 'difficulty',
      values: [1, 2, 3, 4, 5].map((id) => ({
        id,
        name: ['一星', '二星', '三星', '四星', '五星'][id - 1]!,
      })),
    },
    {
      label: '课程类型',
      key: 'type',
      values: [
        { id: 3, name: '混合课程' },
        { id: 1, name: '视频课程' },
        { id: 2, name: '实验课程' },
      ],
    },
    {
      label: '课程难度',
      key: 'grade',
      values: [
        { id: '1', name: '初级' },
        { id: '2', name: '中级' },
        { id: '3', name: '高级' },
      ],
    },
    {
      label: '课程状态',
      key: 'complete',
      values: [
        { id: '1', name: '已完成' },
        { id: '0', name: '未完成' },
      ],
    },
  ]
  return (
    <section
      className="mx-auto max-w-[1366px] space-y-4 p-4"
      aria-label="课程中心"
    >
      <h1 className="text-xl font-semibold">课程中心</h1>
      {expanded ? (
        <div className="space-y-2 rounded border p-4">
          {options.isPending ? (
            <Loading variant="inline" label="正在加载课程筛选…" />
          ) : null}
          {options.isError ? (
            <CourseError
              error={options.error}
              title="课程筛选读取失败"
              retry={() => void options.refetch()}
            />
          ) : null}
          {positions.isError ? (
            <CourseError
              error={positions.error}
              title="岗位读取失败"
              retry={() => void positions.refetch()}
            />
          ) : null}
          {groups.map((group) => (
            <FilterGroup
              key={group.key}
              label={group.label}
              values={group.values}
              selected={filter[group.key]}
              change={(value) => toggle(group.key, value)}
              myPositions={
                group.key === 'position'
                  ? user.data?.extend_info?.position
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}
      <Button variant="ghost" onClick={() => setExpanded(!expanded)}>
        {expanded ? '收起筛选' : '展开筛选'}
      </Button>
      <Input
        className="max-w-sm"
        aria-label="搜索课程"
        placeholder="请输入搜索内容"
        maxLength={300}
        value={filter.search}
        onChange={(e) =>
          setFilter({ ...filter, page: 1, search: e.target.value })
        }
      />
      {list.isPending ? (
        <Loading label="正在加载公开课程…" />
      ) : list.isError ? (
        <CourseError
          error={list.error}
          title="课程列表读取失败"
          retry={() => void list.refetch()}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.data.results.map((course) => (
              <article
                key={course.id}
                className="overflow-hidden rounded border"
              >
                <button
                  className="block aspect-[1.6] w-full bg-muted"
                  type="button"
                  aria-label={`进入 ${course.name}`}
                  disabled={entering !== null}
                  onClick={() => void enter(course.id)}
                >
                  {course.image ? (
                    <img
                      src={course.image}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <span>
                      {course.type === 1
                        ? '视频课程'
                        : course.type === 2
                          ? '实验课程'
                          : '混合课程'}
                    </span>
                  )}
                </button>
                <div className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      variant="link"
                      className="h-auto truncate p-0 text-base"
                      disabled={entering !== null}
                      onClick={() => void enter(course.id)}
                    >
                      {course.name}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {course.progress}
                    </span>
                  </div>
                  <p className="flex flex-wrap gap-x-4 text-sm">
                    <span>
                      等级：
                      {course.difficulty === undefined
                        ? ''
                        : `${course.difficulty}星`}
                    </span>
                    <span>
                      难度：
                      {
                        (
                          { 1: '初级', 2: '中级', 3: '高级' } as Record<
                            string,
                            string
                          >
                        )[String(course.grade)]
                      }
                    </span>
                  </p>
                  <div className="flex gap-2">
                    {course.tag_list.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded bg-muted px-2 text-sm">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!list.data.results.length ? (
            <p className="py-16 text-center text-muted-foreground">
              暂无公开课程
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <ListPagination
              page={debounced.page}
              size={debounced.size}
              count={list.data.count}
              change={(page) => setFilter({ ...filter, page })}
              busy={list.isFetching || filter !== debounced}
            />
            <label className="flex shrink-0 gap-2 text-sm">
              每页
              <select
                value={filter.size}
                onChange={(e) =>
                  setFilter({
                    ...filter,
                    page: 1,
                    size: Number(e.target.value),
                  })
                }
              >
                {[12, 24, 48, 96].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}
    </section>
  )
}
function FilterGroup({
  label,
  values,
  selected,
  change,
  myPositions,
}: {
  label: string
  values: { id: string | number; name: string }[]
  selected: (string | number)[]
  change: (v: string | number | null) => void
  myPositions?: (string | number)[]
}) {
  const [more, setMore] = useState(false)
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-start gap-3 text-sm"
    >
      <span className="w-20 shrink-0 py-2">{label}：</span>
      <div
        className={`flex flex-1 flex-wrap gap-1 ${more || values.length <= 6 ? '' : 'max-h-10 overflow-hidden'}`}
      >
        <Button
          size="sm"
          variant={!selected.length ? 'secondary' : 'ghost'}
          aria-pressed={!selected.length}
          onClick={() => change(null)}
        >
          全部
        </Button>
        {values.map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant={selected.includes(item.id) ? 'secondary' : 'ghost'}
            aria-pressed={selected.includes(item.id)}
            title={
              myPositions?.includes(item.id) ? '这是我的岗位方向哟' : undefined
            }
            onClick={() => change(item.id)}
          >
            {item.name}
          </Button>
        ))}
      </div>
      {values.length > 6 ? (
        <Button size="sm" variant="ghost" onClick={() => setMore(!more)}>
          {more ? '收起' : '更多'}
        </Button>
      ) : null}
    </div>
  )
}
