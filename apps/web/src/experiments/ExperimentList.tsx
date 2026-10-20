import NiceModal from '@ebay/nice-modal-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@workspace/ui/components/button'
import { Badge } from '@workspace/ui/components/badge'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { ActivityTable, ListPagination } from '../activity/ActivityTable'
import { experimentKeys, getExperiments } from '../api/experiments'
import {
  DeleteExperimentModal,
  EditExperimentModal,
  SelectSceneModal,
} from './ExperimentDialogs'

export function ExperimentList() {
  const [filter, setFilter] = useState({ search: '', today: 1, before: 1 })
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">我的工作台</h1>
        <div className="flex gap-3">
          <Button onClick={() => void NiceModal.show(EditExperimentModal)}>
            新建实验
          </Button>
          <Button
            variant="outline"
            onClick={() => void NiceModal.show(SelectSceneModal)}
          >
            场景库选择
          </Button>
        </div>
      </header>
      <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">
        该模块用于独立的仿真测试，不影响其余模块。请及时清理无用的实验记录，避免占用资源。
      </p>
      <div className="grid max-w-md gap-2">
        <Label htmlFor="experiment-search">搜索实验记录</Label>
        <Input
          id="experiment-search"
          value={filter.search}
          onChange={(event) =>
            setFilter({ search: event.target.value, today: 1, before: 1 })
          }
        />
      </div>
      <ExperimentPeriod
        period="today"
        title="今天"
        page={filter.today}
        search={filter.search}
        change={(page) => setFilter((current) => ({ ...current, today: page }))}
      />
      <ExperimentPeriod
        period="before"
        title="更早"
        page={filter.before}
        search={filter.search}
        change={(page) =>
          setFilter((current) => ({ ...current, before: page }))
        }
      />
    </section>
  )
}

function ExperimentPeriod({
  period,
  title,
  page,
  search,
  change,
}: {
  period: 'today' | 'before'
  title: string
  page: number
  search: string
  change: (page: number) => void
}) {
  const client = useQueryClient()
  const list = useQuery({
    queryKey: [...experimentKeys.lists, period, page, search],
    queryFn: ({ signal }) => getExperiments(period, page, search, signal),
    retry: false,
  })
  return (
    <section
      role="region"
      aria-label={title}
      className="space-y-4 rounded-lg border p-4"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      {list.isPending ? (
        <p role="status">正在加载实验…</p>
      ) : list.isError ? (
        <p role="alert">
          实验读取失败。
          <Button variant="link" onClick={() => void list.refetch()}>
            重试{title}实验
          </Button>
        </p>
      ) : (
        <>
          <ActivityTable
            name={`${title}实验`}
            data={list.data.results}
            empty="暂无实验记录"
            columns={[
              {
                accessorKey: 'name',
                header: '实验名称',
                cell: ({ row }) => (
                  <Link
                    className="text-primary hover:underline"
                    to="/basic/user/bench/experiment/$id/overview"
                    params={{ id: String(row.original.id) }}
                  >
                    {row.original.name}
                  </Link>
                ),
              },
              { accessorKey: 'node_count', header: '节点数' },
              {
                accessorKey: 'start_status',
                header: '状态',
                cell: ({ row }) => (
                  <Badge variant="secondary">
                    {row.original.start_status ? '运行中' : '未启动'}
                  </Badge>
                ),
              },
              { accessorKey: 'create_time', header: '添加时间' },
              {
                accessorKey: 'source',
                header: '来源',
                cell: ({ row }) =>
                  row.original.source === 1 ? '新建' : '场景库',
              },
              {
                id: 'actions',
                header: '操作',
                cell: ({ row }) => (
                  <div className="flex gap-2">
                    <Button
                      variant="link"
                      onClick={() =>
                        void NiceModal.show(EditExperimentModal, {
                          experiment: row.original,
                        })
                      }
                    >
                      编辑
                    </Button>
                    <Button
                      variant="link"
                      onClick={() =>
                        void NiceModal.show(DeleteExperimentModal, {
                          experiment: row.original,
                          deleted: async () => {
                            if (list.data.results.length === 1 && page > 1)
                              change(page - 1)
                            client.removeQueries({
                              queryKey: experimentKeys.detail(row.original.id),
                            })
                            await client.invalidateQueries({
                              queryKey: experimentKeys.lists,
                            })
                          },
                        })
                      }
                    >
                      删除
                    </Button>
                  </div>
                ),
              },
            ]}
          />
          <ListPagination
            page={page}
            size={10}
            count={list.data.count}
            busy={list.isFetching}
            change={change}
          />
        </>
      )}
    </section>
  )
}
