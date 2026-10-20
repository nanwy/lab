import { createContext, useContext, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, Outlet } from '@tanstack/react-router'
import { Button } from '@workspace/ui/components/button'
import { Badge } from '@workspace/ui/components/badge'
import { ApiError } from '../api'
import {
  experimentKeys,
  getExperiment,
  type ExperimentDetail,
} from '../api/experiments'
import { ExperimentForm } from './ExperimentForm'

const ExperimentContext = createContext<ExperimentDetail | null>(null)

export function useExperiment() {
  const experiment = useContext(ExperimentContext)
  if (!experiment) throw new Error('实验子页必须位于实验上下文内')
  return experiment
}

export function ExperimentLayout({ id }: { id: string }) {
  const detail = useQuery({
    queryKey: experimentKeys.detail(id),
    queryFn: ({ signal }) => getExperiment(id, signal),
    retry: false,
  })
  if (detail.isPending) return <p role="status">正在加载实验…</p>
  if (detail.isError)
    return (
      <section className="space-y-4" role="alert">
        <h1 className="text-xl font-semibold">
          {detail.error instanceof ApiError && detail.error.status === 404
            ? '该实验已被删除或不存在'
            : '实验详情读取失败'}
        </h1>
        <Button variant="outline" onClick={() => void detail.refetch()}>
          重试实验详情
        </Button>
        <Link className="ml-4 text-primary underline" to="/basic/user/bench">
          返回实验列表
        </Link>
      </section>
    )
  const experiment = detail.data
  return (
    <ExperimentContext.Provider value={experiment}>
      <section className="space-y-6">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">{experiment.name}</h1>
          <Link className="text-primary underline" to="/basic/user/bench">
            返回实验列表
          </Link>
        </header>
        <div className="grid gap-6 md:grid-cols-[8rem_1fr]">
          <nav
            aria-label="实验导航"
            className="flex flex-wrap gap-3 md:flex-col"
          >
            <Link
              to="/basic/user/bench/experiment/$id/overview"
              params={{ id }}
              activeProps={{
                'aria-current': 'page',
                className: 'font-semibold text-primary',
              }}
            >
              场景信息
            </Link>
            <Link
              to="/basic/user/bench/experiment/$id/explain"
              params={{ id }}
              activeProps={{
                'aria-current': 'page',
                className: 'font-semibold text-primary',
              }}
            >
              场景说明
            </Link>
            {[
              ['scene', '场景拓扑'],
              ['simulate', '模拟蓝军'],
              ['flow', '流量监控'],
              ['notes', '场景笔记'],
              ['detection/penetration', '检测手段'],
              ['attackteaching', '攻击教学'],
            ].map(([path, label]) => (
              <Link
                key={path}
                to="/basic/user/bench/experiment/$id/$"
                params={{ id, _splat: path! }}
                activeProps={{ 'aria-current': 'page' }}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="min-w-0 rounded-lg border p-5">
            <Outlet />
          </div>
        </div>
      </section>
    </ExperimentContext.Provider>
  )
}

export function ExperimentOverview() {
  const experiment = useExperiment()
  const [editing, setEditing] = useState(false)
  return (
    <section className="space-y-5">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">基本信息</h2>
        {!editing ? (
          <Button variant="outline" onClick={() => setEditing(true)}>
            编辑基本信息
          </Button>
        ) : null}
      </header>
      {editing ? (
        <ExperimentForm
          experiment={experiment}
          detail={experiment}
          saved={async () => setEditing(false)}
          cancel={() => setEditing(false)}
        />
      ) : (
        <dl className="grid gap-4 sm:grid-cols-[6rem_1fr]">
          <dt className="text-muted-foreground">场景名称</dt>
          <dd>{experiment.name}</dd>
          <dt className="text-muted-foreground">创建者</dt>
          <dd>{experiment.user_name}</dd>
          <dt className="text-muted-foreground">场景描述</dt>
          <dd className="whitespace-pre-wrap">{experiment.desc || '—'}</dd>
          <dt className="text-muted-foreground">节点总数</dt>
          <dd>{experiment.node_count}</dd>
          <dt className="text-muted-foreground">场景标签</dt>
          <dd className="flex flex-wrap gap-2">
            {experiment.tags.length
              ? experiment.tags.map((tag) => (
                  <Badge key={tag.name} variant="secondary">
                    {tag.name}
                  </Badge>
                ))
              : '—'}
          </dd>
        </dl>
      )}
    </section>
  )
}

export function ExperimentExplanation() {
  const experiment = useExperiment()
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">场景说明</h2>
      {experiment.overview ? (
        <iframe
          className="min-h-[28rem] w-full rounded-md border bg-white"
          title="场景说明正文"
          sandbox=""
          srcDoc={`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{font-family:system-ui;line-height:1.7;padding:16px;overflow-wrap:anywhere}img{max-width:100%}</style></head><body>${experiment.overview}</body></html>`}
        />
      ) : (
        <p className="text-muted-foreground">暂无场景说明</p>
      )}
      <p className="text-sm text-muted-foreground">
        富文本编辑与图片上传统一在 S10 接入。
      </p>
    </section>
  )
}
