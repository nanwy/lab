import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button } from '@workspace/ui/components/button'
import { Badge } from '@workspace/ui/components/badge'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@workspace/ui/components/tabs'
import { ApiError } from '../api'
import {
  detectionCategories,
  getDetectionTools,
  getDetectionTool,
  type DetectionCategory,
  type DetectionTool,
} from '../api/detection-tools'
import { currentUserQueryOptions } from '../auth/session'
import { RichContentReadOnly } from '../content/RichContentEditor'
import { useExperiment } from '../experiments/ExperimentContext'

export function DetectionToolsPage({
  category,
}: {
  category?: DetectionCategory
}) {
  const experiment = useExperiment()
  const user = useQuery(currentUserQueryOptions())
  if (!user.data) return <p role="status">正在加载账号…</p>
  return (
    <section className="space-y-5">
      <nav aria-label="检测分类" className="flex flex-wrap gap-5 border-b pb-3">
        {detectionCategories.map((entry) => (
          <Link
            key={entry.type}
            to="/basic/user/bench/experiment/$id/detection/$type"
            params={{ id: String(experiment.id), type: entry.type }}
            aria-current={
              (category?.type ?? 'penetration') === entry.type
                ? 'page'
                : undefined
            }
            className={
              (category?.type ?? 'penetration') === entry.type
                ? 'font-semibold text-primary'
                : 'text-muted-foreground'
            }
          >
            {entry.label}
          </Link>
        ))}
      </nav>
      {category ? (
        <CatalogSession
          key={`${user.data.id}:${experiment.id}:${category.type}`}
          account={user.data.id}
          experimentId={experiment.id}
          category={category}
        />
      ) : (
        <p>请选择检测分类</p>
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
  error: Error
  retry: () => void
}) {
  return (
    <section className="space-y-3" role="alert">
      <p>
        {error instanceof ApiError && error.status === 403
          ? '无权读取检测工具'
          : title}
      </p>
      {!(error instanceof ApiError && error.handled) && (
        <p className="text-destructive">{error.message}</p>
      )}
      <Button variant="outline" onClick={retry}>
        重新读取
      </Button>
    </section>
  )
}
function CatalogSession({
  account,
  experimentId,
  category,
}: {
  account: string | number
  experimentId: string | number
  category: DetectionCategory
}) {
  const [selected, setSelected] = useState<string | number | null>(null)
  const list = useQuery({
    queryKey: ['detection-tools', account, experimentId, category.type, 'list'],
    queryFn: ({ signal }) => getDetectionTools(category.value, signal),
    retry: false,
  })
  const current =
    list.data?.find((tool) => String(tool.id) === String(selected)) ??
    list.data?.[0]
  if (list.isPending) return <p role="status">正在加载检测工具…</p>
  if (list.isError)
    return (
      <ReadError
        title="检测工具列表读取失败"
        error={list.error}
        retry={() => void list.refetch()}
      />
    )
  if (!list.data.length) return <p>暂无检测工具</p>
  return (
    <div className="grid gap-5 md:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="选择检测工具" className="space-y-3 border-r pr-4">
        {list.data.map((tool) => (
          <div
            key={tool.id}
            className={`rounded-md border-2 p-3 ${String(current?.id) === String(tool.id) ? 'border-primary bg-accent' : 'border-border'}`}
          >
            <Button
              variant="ghost"
              className="h-auto w-full whitespace-normal"
              aria-pressed={String(current?.id) === String(tool.id)}
              onClick={() => setSelected(tool.id)}
            >
              {tool.name}
            </Button>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {tool.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </nav>
      {current && (
        <ToolDetail
          key={String(current.id)}
          account={account}
          experimentId={experimentId}
          category={category.type}
          toolId={current.id}
        />
      )}
    </div>
  )
}
function ToolDetail({
  account,
  experimentId,
  category,
  toolId,
}: {
  account: string | number
  experimentId: string | number
  category: string
  toolId: string | number
}) {
  const detail = useQuery({
    queryKey: [
      'detection-tools',
      account,
      experimentId,
      category,
      'detail',
      toolId,
    ],
    queryFn: ({ signal }) => getDetectionTool(toolId, signal),
    retry: false,
  })
  if (detail.isPending) return <p role="status">正在加载工具详情…</p>
  if (detail.isError)
    return (
      <ReadError
        title="检测工具详情读取失败"
        error={detail.error}
        retry={() => void detail.refetch()}
      />
    )
  const tool = detail.data
  return (
    <Tabs defaultValue="info">
      <TabsList aria-label="工具详情">
        <TabsTrigger value="info">基本信息</TabsTrigger>
        <TabsTrigger value="manual">使用手册</TabsTrigger>
        <TabsTrigger value="materials">相关资料</TabsTrigger>
      </TabsList>
      <TabsContent value="info">
        <ToolInfo tool={tool} />
      </TabsContent>
      <TabsContent value="manual">
        {tool.user_manual ? (
          <RichContentReadOnly value={tool.user_manual} />
        ) : (
          <p>暂无使用手册</p>
        )}
      </TabsContent>
      <TabsContent value="materials">
        <p role="note">相关资料功能待交付</p>
      </TabsContent>
    </Tabs>
  )
}
function ToolInfo({ tool }: { tool: DetectionTool }) {
  const attachment = tool.carrier_path
  return (
    <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-5 rounded-md border p-4">
      <dt>工具名称</dt>
      <dd>{tool.name}</dd>
      <dt>工具描述</dt>
      <dd className="whitespace-pre-wrap break-words">
        {tool.description || '暂无'}
      </dd>
      <dt>工具载体</dt>
      <dd>
        {tool.tool_carrier === 1 ? (
          attachment ? (
            <a
              className="text-primary underline"
              href={attachment}
              target="_blank"
              rel="noopener noreferrer"
            >
              {attachment.split('/').at(-1)} 附件
            </a>
          ) : (
            '暂无附件'
          )
        ) : (
          `${tool.image_info?.name || '暂无'} 镜像`
        )}
      </dd>
      <dt>账号密码</dt>
      <dd className="whitespace-pre-wrap break-words">
        {tool.account || '暂无'}
      </dd>
      <dt>标签</dt>
      <dd className="flex flex-wrap gap-2">
        {tool.tags.map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
      </dd>
    </dl>
  )
}
