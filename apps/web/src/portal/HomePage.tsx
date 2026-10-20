import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { toast } from '@workspace/ui/components/sonner'
import { ApiError } from '../api'
import { Button } from '@workspace/ui/components/button'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  getCourseAvailability,
  getLearningStatistics,
  getRecommendations,
} from '../api/portal'
import { currentUserQueryOptions } from '../auth/session'
import { usePageSignal } from '../auth/use-page-signal'
import { HomePersonalSummary } from './HomePersonalSummary'
import { RecommendationSettingsDialog } from './RecommendationSettingsDialog'
import { navigation } from './navigation'

declare module '@tanstack/react-router' {
  interface HistoryState {
    id?: string | number
  }
}

export function HomePage() {
  const user = useQuery(currentUserQueryOptions())
  const statistics = useQuery({
    queryKey: ['home', 'statistics'],
    queryFn: ({ signal }) => getLearningStatistics(signal),
    retry: false,
  })
  const [guide, setGuide] = useState(false)
  const pageSignal = usePageSignal()
  const courseCheck = useRef<AbortController | null>(null)
  const navigate = useNavigate()
  async function openCourse(id: string | number) {
    // 用户切换课程时取消旧意图，不能让旧课程的迟到结果覆盖新选择。
    courseCheck.current?.abort()
    courseCheck.current = new AbortController()
    const signal = AbortSignal.any([pageSignal(), courseCheck.current.signal])
    try {
      const course = await getCourseAvailability(id, signal)
      if (signal.aborted) return
      if (course.is_open)
        await navigate({
          to: '/basic/$',
          params: { _splat: `training/course/${id}` },
        })
      else toast.error('该课程已被关闭')
    } catch (error) {
      if (signal.aborted) return
      if (!(error instanceof ApiError) || !error.handled)
        toast.error(
          error instanceof ApiError
            ? error.message
            : '课程状态检查失败，请重试',
        )
    }
  }
  const recent = statistics.data?.recent_course
  return (
    <section className="space-y-8">
      <header className="space-y-4 border-b pb-7">
        <p className="text-sm font-semibold tracking-widest text-muted-foreground">
          学员端
        </p>
        <h1 className="text-3xl font-semibold">首页</h1>
        <p className="text-muted-foreground">
          没有网络安全就没有国家安全，为网络安全强国珍惜每一分钟。
        </p>
        {statistics.isPending ? (
          <p role="status">正在读取学习概览…</p>
        ) : statistics.isError ? (
          <div role="alert">
            学习概览读取失败。
            <Button variant="link" onClick={() => void statistics.refetch()}>
              重试概览
            </Button>
          </div>
        ) : (
          <p>
            {user.data?.username || '学员'}，您好！今天是{' '}
            {new Date().toLocaleDateString('zh-CN')}，是您入驻平台的第{' '}
            {statistics.data.day} 天，您已经完成了{' '}
            {statistics.data.learn_duration} 天的学习。
          </p>
        )}
        {recent?.mode === '专题' ? (
          <p className="flex flex-wrap items-center gap-3">
            最近学习：{recent.name}
            {recent.section ? ` / ${recent.section.name}` : ''}
            <LoadingButton
              variant="outline"
              onClick={() => openCourse(recent.id)}
            >
              继续学习
            </LoadingButton>
          </p>
        ) : null}
      </header>
      <div className="flex gap-3" aria-label="首页视图">
        <Button
          aria-pressed={!guide}
          variant={!guide ? 'default' : 'outline'}
          onClick={() => setGuide(false)}
        >
          系统导航
        </Button>
        <Button
          aria-pressed={guide}
          variant={guide ? 'default' : 'outline'}
          onClick={() => setGuide(true)}
        >
          学习指南
        </Button>
      </div>
      {guide ? (
        <LearningGuide openCourse={openCourse} />
      ) : (
        <nav aria-label="系统导航" className="space-y-8">
          {navigation.map((group) => (
            <section
              key={group.name}
              className="grid gap-4 border-t pt-5 sm:grid-cols-[10rem_1fr]"
            >
              <h2 className="text-lg font-semibold">{group.name}</h2>
              <div className="flex flex-wrap gap-4">
                {group.items.map((item) => (
                  <Link
                    className="rounded-md border px-4 py-3 hover:bg-accent"
                    key={item.path}
                    to={
                      item.path === '/basic/user/bench' ? item.path : '/basic/$'
                    }
                    params={
                      item.path === '/basic/user/bench'
                        ? {}
                        : { _splat: item.path.slice(7) }
                    }
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </nav>
      )}
    </section>
  )
}

function LearningGuide({
  openCourse,
}: {
  openCourse: (id: string | number) => Promise<void>
}) {
  const recommendations = useQuery({
    queryKey: ['home', 'recommendations'],
    queryFn: ({ signal }) => getRecommendations(signal),
    retry: false,
  })
  const [settings, setSettings] = useState(false)
  const data = recommendations.data
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="min-w-0 space-y-7">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">平台推荐</h2>
          <Button variant="outline" onClick={() => setSettings(true)}>
            推荐设置
          </Button>
        </div>
        {recommendations.isPending ? (
          <p role="status">正在读取推荐…</p>
        ) : recommendations.isError ? (
          <div role="alert">
            推荐资源读取失败。
            <Button onClick={() => void recommendations.refetch()}>
              重试推荐
            </Button>
          </div>
        ) : data ? (
          <>
            <section className="space-y-4 border-t pt-5">
              <div className="flex justify-between gap-3">
                <h3 className="text-lg font-semibold">路线推荐</h3>
                <Link
                  className="text-primary underline"
                  to="/basic/$"
                  params={{ _splat: 'user/studypath' }}
                >
                  查看更多路线
                </Link>
              </div>
              {data.learning_route.length ? (
                <ul className="flex flex-wrap gap-4">
                  {data.learning_route.slice(0, 3).map((item) => (
                    <li key={item.id}>
                      <Link
                        className="text-primary underline"
                        to="/basic/$"
                        params={{ _splat: 'user/studypath' }}
                        state={{ id: item.id }}
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">暂无推荐路线</p>
              )}
            </section>
            <section className="space-y-4 border-t pt-5">
              <h3 className="text-lg font-semibold">实操推荐</h3>
              {data.practical_operation ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  <section className="space-y-3">
                    <h4 className="font-semibold">场景实操</h4>
                    {data.practical_operation.subject_operate.length ? (
                      <ul className="space-y-3">
                        {data.practical_operation.subject_operate.map(
                          (item) => (
                            <li key={item.id}>
                              <Link
                                className="text-primary underline"
                                to="/basic/$"
                                params={{
                                  _splat: `training/subject/${item.id}`,
                                }}
                              >
                                {item.name}
                              </Link>
                            </li>
                          ),
                        )}
                      </ul>
                    ) : (
                      <p>暂无场景实操推荐</p>
                    )}
                  </section>
                  <section className="space-y-3">
                    <h4 className="font-semibold">CTF 竞赛</h4>
                    {data.practical_operation.test_operate.length ? (
                      <ul className="space-y-3">
                        {data.practical_operation.test_operate.map((item) => (
                          <li key={item.id}>
                            <Link
                              className="text-primary underline"
                              to="/basic/$"
                              params={{ _splat: 'exam/practice' }}
                            >
                              {item.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>暂无 CTF 推荐</p>
                    )}
                  </section>
                </div>
              ) : (
                <p className="text-muted-foreground">暂无实操推荐</p>
              )}
            </section>
            <section className="space-y-4 border-t pt-5">
              <div className="flex justify-between gap-3">
                <h3 className="text-lg font-semibold">课程推荐</h3>
                <Link
                  className="text-primary underline"
                  to="/basic/$"
                  params={{ _splat: 'training/course' }}
                >
                  查看更多课程
                </Link>
              </div>
              {data.course.length ? (
                <ul className="divide-y">
                  {data.course.map((course) => (
                    <li key={course.id}>
                      <LoadingButton
                        variant="ghost"
                        className="h-auto w-full justify-start gap-4 py-4 text-left whitespace-normal"
                        onClick={() => openCourse(course.id)}
                      >
                        {course.image ? (
                          <img
                            src={course.image}
                            alt=""
                            className="h-16 w-24 rounded object-cover"
                          />
                        ) : null}
                        <span className="grid gap-2">
                          <span className="font-semibold">{course.name}</span>
                          <span className="text-sm text-muted-foreground">
                            {course.type === 1
                              ? '视频专题'
                              : course.type === 2
                                ? '实验专题'
                                : '混合专题'}{' '}
                            · 进度 {course.progress} · 等级 {course.difficulty}
                          </span>
                        </span>
                      </LoadingButton>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">暂无推荐课程</p>
              )}
            </section>
          </>
        ) : null}
        {settings ? (
          <RecommendationSettingsDialog close={() => setSettings(false)} />
        ) : null}
      </section>
      <HomePersonalSummary />
    </div>
  )
}
