import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Button } from '@workspace/ui/components/button'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { toast } from '@workspace/ui/components/sonner'
import { usePageSignal } from '../auth/use-page-signal'
import { captureError, CaptureConfirmation } from './CaptureRecords'
import { MirrorRuleForm } from './MirrorRuleForm'
import { runMirrorRule } from '../api/traffic-mirroring'
import { Input } from '@workspace/ui/components/input'
import { ActivityTable, ListPagination } from '../activity/ActivityTable'
import { getMirrorRules, type MirrorRule } from '../api/traffic-mirroring'

export function TrafficMirroring({ id }: { id: string | number }) {
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<MirrorRule | null>(null)
  const signal = usePageSignal()
  const [filter, setFilter] = useState({ page: 1, size: 10, search: '' })
  const rules = useQuery({
    queryKey: ['traffic-mirroring', id, filter],
    queryFn: ({ signal }) => getMirrorRules(id, filter, signal),
    retry: false,
    gcTime: 0,
  })
  async function operate(
    rule: MirrorRule,
    action: 'start' | 'stop' | 'delete',
  ) {
    const currentSignal = signal()
    try {
      await runMirrorRule(id, rule.id, action, currentSignal)
      if (currentSignal.aborted) return
      toast.success(
        { start: '启动成功！', stop: '关闭成功！', delete: '删除成功！' }[
          action
        ],
      )
      if (action === 'delete') {
        setDeleting(null)
        if (filter.page > 1 && rules.data?.results.length === 1) {
          setFilter({ ...filter, page: filter.page - 1 })
          return
        }
      }
    } finally {
      if (
        !currentSignal.aborted &&
        (action !== 'delete' ||
          rules.data?.results.length !== 1 ||
          filter.page === 1)
      )
        await rules.refetch()
    }
  }
  const columns: ColumnDef<MirrorRule>[] = [
    {
      id: 'serial',
      header: '序号',
      cell: ({ row }) => (filter.page - 1) * filter.size + row.index + 1,
    },
    { accessorKey: 'src_node_name', header: '源节点名称' },
    { accessorKey: 'src_tap', header: '源节点TAP网卡' },
    { accessorKey: 'dst_node_name', header: '目标节点名称' },
    { accessorKey: 'dst_tap', header: '目标节点TAP网卡' },
    {
      accessorKey: 'status',
      header: '规则状态',
      cell: ({ row }) =>
        ({ 1: '未启动', 2: '启动成功', 3: '启动失败' })[row.original.status],
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <LoadingButton
            variant="link"
            onClick={() =>
              operate(
                row.original,
                row.original.status === 2 ? 'stop' : 'start',
              )
            }
            onError={captureError}
          >
            {row.original.status === 2 ? '关闭' : '启动'}
          </LoadingButton>
          <Button variant="link" onClick={() => setDeleting(row.original)}>
            删除
          </Button>
        </div>
      ),
    },
  ]
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Input
          aria-label="镜像规则搜索"
          placeholder="输入搜索内容"
          maxLength={300}
          className="max-w-xs"
          value={filter.search}
          onChange={(event) =>
            setFilter({ ...filter, page: 1, search: event.target.value })
          }
        />
        <Button onClick={() => setAdding(true)}>添加规则</Button>
      </div>
      {rules.isPending ? (
        <p role="status">正在加载流量镜像规则…</p>
      ) : rules.isError ? (
        <p role="alert">{rules.error.message}</p>
      ) : (
        <ActivityTable
          name="流量镜像规则"
          empty="暂无流量镜像规则"
          data={rules.data.results}
          columns={columns}
        />
      )}
      <ListPagination
        {...filter}
        count={rules.data?.count ?? 0}
        change={(page) => setFilter({ ...filter, page })}
        busy={rules.isFetching}
      />
      {adding ? (
        <MirrorRuleForm
          id={id}
          close={() => setAdding(false)}
          refresh={() => rules.refetch()}
        />
      ) : null}
      {deleting ? (
        <CaptureConfirmation
          title="确认删除当前流量镜像规则？"
          close={() => setDeleting(null)}
          confirm={() => operate(deleting, 'delete')}
        />
      ) : null}
    </section>
  )
}
