import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Button } from '@workspace/ui/components/button'
import { toast } from '@workspace/ui/components/sonner'
import { ActivityTable, ListPagination } from '../activity/ActivityTable'
import { useExperiment } from '../experiments/ExperimentContext'
import {
  getCaptureMarks,
  setCapture,
  captureStatusLabels,
  type CaptureMark,
} from '../api/traffic-capture'
import { usePageSignal } from '../auth/use-page-signal'
import {
  CaptureConfirmation,
  CaptureRecords,
  useCaptureRecordsState,
} from './CaptureRecords'

export function ExperimentFlowPage() {
  const experiment = useExperiment()
  if (experiment.topo_id == null)
    return <p role="note">该实验尚未配置场景拓扑。</p>
  return <ExperimentFlow key={experiment.topo_id} id={experiment.topo_id} />
}
function ExperimentFlow({ id }: { id: string | number }) {
  const recordsState = useCaptureRecordsState()
  const [page, setPage] = useState(1)
  const [target, setTarget] = useState<CaptureMark | null>(null)
  const signal = usePageSignal()
  const client = useQueryClient()
  const marks = useQuery({
    queryKey: ['capture-marks', id, page],
    queryFn: ({ signal }) => getCaptureMarks(id, { page, size: 5 }, signal),
    retry: false,
  })
  const columns: ColumnDef<CaptureMark>[] = [
    {
      id: 'serial',
      header: '序号',
      cell: ({ row }) => (page - 1) * 5 + row.index + 1,
    },
    {
      accessorKey: 'mark_path',
      header: '标记位置',
      cell: ({ row }) => row.original.mark_path.join('、'),
    },
    {
      accessorKey: 'pcap_filter',
      header: '标记规则',
      cell: ({ row }) => {
        const { proto, host, port } = row.original.pcap_filter
        return (
          `${proto ? `${proto}--` : ''}${host}${host && port ? `:${port}` : ''}` ||
          '--'
        )
      },
    },
    {
      accessorKey: 'pcap_size',
      header: '包大小',
      cell: ({ row }) => `${row.original.pcap_size}M`,
    },
    { accessorKey: 'create_time', header: '开始时间' },
    { accessorKey: 'duration_time', header: '持续时间' },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => captureStatusLabels[row.original.status],
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <Button variant="link" onClick={() => setTarget(row.original)}>
          {row.original.status === 2 ? '停止' : '开启'}
        </Button>
      ),
    },
  ]
  async function confirm() {
    if (!target) return
    const start = target.status !== 2
    await setCapture(
      id,
      target.topo_line,
      start
        ? { pcap_size: target.pcap_size, pcap_filter: target.pcap_filter }
        : undefined,
      signal(),
    )
    if (signal().aborted) return
    setTarget(null)
    toast.success(start ? '开启成功！' : '停止成功！')
    if (!start && page > 1 && marks.data?.results.length === 1)
      setPage(page - 1)
    else await marks.refetch()
    if (start)
      await client.invalidateQueries({ queryKey: ['capture-records', id] })
  }
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">流量标记节点</h2>
        {marks.isPending ? (
          <p role="status">正在加载流量标记…</p>
        ) : marks.isError ? (
          <p role="alert">流量标记读取失败：{marks.error.message}</p>
        ) : (
          <ActivityTable
            name="流量标记节点"
            empty="暂无流量标记"
            data={marks.data.results}
            columns={columns}
          />
        )}
        <ListPagination
          page={page}
          size={5}
          count={marks.data?.count ?? 0}
          change={setPage}
          busy={marks.isFetching}
        />
      </section>
      <h2 className="text-lg font-semibold">流量记录</h2>
      <CaptureRecords id={id} state={recordsState} />
      {target && (
        <CaptureConfirmation
          title={`确认${target.status === 2 ? '停止' : '开启'}流量标记？`}
          close={() => setTarget(null)}
          confirm={confirm}
        />
      )}
    </div>
  )
}
