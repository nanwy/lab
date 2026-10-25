import { useState } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { Button } from '@workspace/ui/components/button'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { toast } from '@workspace/ui/components/sonner'
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
} from '@workspace/ui/components/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@workspace/ui/components/alert-dialog'
import type { BlueId } from '../api/blue-team'
import {
  blueControlBase,
  blueControlCommand,
  getBlueComparison,
  type BlueRound,
  type BlueRoundPage,
  type BlueComparison,
} from '../api/blue-control'
import { usePageSignal } from '../auth/use-page-signal'
import { blueError } from './feedback'
const roundStatus: Record<number, string> = {
  0: '初始化',
  1: '执行中',
  2: '暂停中',
  4: '已结束',
  5: '对比中',
}
export function ControlRounds({
  taskId,
  blueId,
  rounds,
  page,
  setPage,
}: {
  taskId: BlueId
  blueId: BlueId
  rounds: UseQueryResult<BlueRoundPage>
  page: number
  setPage: (page: number) => void
}) {
  const signalForPage = usePageSignal(),
    [deleting, setDeleting] = useState<BlueRound | null>(null),
    [selected, setSelected] = useState<BlueRound | null>(null),
    [busy, setBusy] = useState<string | null>(null)
  async function remove() {
    if (!deleting || busy) return
    const signal = signalForPage()
    setBusy('delete')
    try {
      await blueControlCommand(
        `${blueControlBase(taskId, blueId)}/control_record/${encodeURIComponent(deleting.id)}/`,
        undefined,
        signal,
        'DELETE',
      )
      if (signal.aborted) return
      setDeleting(null)
      toast.success('删除成功')
      if (page > 1 && rounds.data?.results.length === 1) setPage(page - 1)
      else await rounds.refetch()
    } catch (e) {
      if (!signal.aborted) blueError(e)
    } finally {
      if (!signal.aborted) setBusy(null)
    }
  }
  async function compare(round: BlueRound) {
    if (busy || round.status !== 4 || round.round === 1) return
    const signal = signalForPage()
    setBusy(String(round.id))
    try {
      await blueControlCommand(
        `${blueControlBase(taskId, blueId)}/control_record/compare/${encodeURIComponent(round.id)}/`,
        undefined,
        signal,
      )
      if (signal.aborted) return
      toast.success('对比完成，点击查看，可查看对比结果！')
      await rounds.refetch()
    } catch (e) {
      if (!signal.aborted) blueError(e)
    } finally {
      if (!signal.aborted) setBusy(null)
    }
  }
  const columns: ColumnDef<BlueRound>[] = [
    {
      id: 'number',
      header: '序号',
      cell: ({ row }) => (page - 1) * 5 + row.index + 1,
    },
    {
      accessorKey: 'round',
      header: '攻击轮次',
      cell: ({ row }) => `第${row.original.round}轮`,
    },
    {
      accessorKey: 'status',
      header: '执行状态',
      cell: ({ row }) =>
        roundStatus[row.original.status] ?? String(row.original.status),
    },
    {
      accessorKey: 'start_time',
      header: '启动时间',
      cell: ({ row }) => row.original.start_time || '--',
    },
    {
      accessorKey: 'end_time',
      header: '结束时间',
      cell: ({ row }) => row.original.end_time || '--',
    },
    {
      id: 'duration',
      header: '执行时长',
      cell: ({ row }) =>
        row.original.start_time && row.original.end_time
          ? duration(row.original.start_time, row.original.end_time)
          : '执行中',
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <div className="flex gap-1">
          {row.original.status === 5 ? (
            <Button
              variant="link"
              aria-label={`查看第${row.original.round}轮`}
              onClick={() => setSelected(row.original)}
            >
              查看
            </Button>
          ) : (
            <LoadingButton
              variant="link"
              aria-label={`对比第${row.original.round}轮`}
              loading={busy === String(row.original.id)}
              disabled={
                busy != null ||
                row.original.status !== 4 ||
                row.original.round === 1
              }
              onClick={() => void compare(row.original)}
            >
              对比
            </LoadingButton>
          )}
          <Button
            variant="link"
            aria-label={`删除第${row.original.round}轮`}
            disabled={busy != null}
            onClick={() => setDeleting(row.original)}
          >
            删除
          </Button>
        </div>
      ),
    },
  ]
  const table = useReactTable({
    data: rounds.data?.results ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => String(r.id),
  })
  return (
    <div className="grid gap-5 2xl:grid-cols-2">
      <section className="space-y-3">
        <h3 className="font-semibold">模拟蓝军攻击轮次</h3>
        <Table aria-label="攻击轮次">
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((h) => (
                  <TableHead key={h.id}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rounds.isPending ? (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <Loading label="正在读取攻击轮次…" />
                </TableCell>
              </TableRow>
            ) : rounds.isError ? (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <div role="alert">
                    轮次读取失败
                    <Button
                      variant="link"
                      onClick={() => void rounds.refetch()}
                    >
                      重试轮次
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((c) => (
                    <TableCell key={c.id}>
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length}>暂无攻击轮次</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <nav
          aria-label="轮次分页"
          className="flex items-center justify-center gap-3"
        >
          <Button
            variant="outline"
            disabled={page === 1 || rounds.isFetching || busy != null}
            onClick={() => setPage(page - 1)}
          >
            上一页
          </Button>
          <span>
            第{page}页，共{rounds.data?.count ?? 0}条
          </span>
          <Button
            variant="outline"
            disabled={
              !rounds.data ||
              page * 5 >= rounds.data.count ||
              rounds.isFetching ||
              busy != null
            }
            onClick={() => setPage(page + 1)}
          >
            下一页
          </Button>
        </nav>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">
          对比分析结果{selected ? `（第${selected.round}轮）` : ''}
        </h3>
        {selected ? (
          <ComparisonResults
            key={String(selected.id)}
            taskId={taskId}
            blueId={blueId}
            roundId={selected.id}
          />
        ) : (
          <p>请点击左侧攻击轮次列表对比按钮，对比完成可查看对比结果</p>
        )}
      </section>
      <AlertDialog
        open={!!deleting}
        onOpenChange={(v) => {
          if (!v && !busy) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除第{deleting?.round}轮数据</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除第{deleting?.round}轮数据？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy != null}
              onClick={() => setDeleting(null)}
            >
              取消
            </Button>
            <LoadingButton
              loading={busy === 'delete'}
              disabled={busy != null}
              onClick={() => void remove()}
            >
              确认删除
            </LoadingButton>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
function duration(start: string, end: string) {
  const milliseconds = Date.parse(end) - Date.parse(start)
  if (!Number.isFinite(milliseconds)) return '--'
  const seconds = Math.floor(milliseconds / 1000)
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}时${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}分${String(seconds % 60).padStart(2, '0')}秒`
}
function ComparisonResults({
  taskId,
  blueId,
  roundId,
}: {
  taskId: BlueId
  blueId: BlueId
  roundId: BlueId
}) {
  const [page, setPage] = useState(1),
    [detail, setDetail] = useState<BlueComparison | null>(null)
  const query = useQuery({
    queryKey: [
      'blue-control',
      String(taskId),
      String(blueId),
      'comparison',
      String(roundId),
      page,
    ],
    queryFn: ({ signal }) =>
      getBlueComparison(taskId, blueId, roundId, page, signal),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const columns: ColumnDef<BlueComparison>[] = [
    { accessorKey: 'sub_technology_name', header: '执行攻击动作' },
    {
      accessorKey: 'undefended_return',
      header: '未防御攻击数据',
      cell: ({ row }) => (
        <div className="max-w-48 truncate">
          {JSON.stringify(row.original.undefended_return)}
        </div>
      ),
    },
    {
      accessorKey: 'defended_return',
      header: '防御后攻击数据',
      cell: ({ row }) => (
        <div className="max-w-48 truncate">
          {JSON.stringify(row.original.defended_return)}
        </div>
      ),
    },
    { accessorKey: 'conclusion', header: '结论' },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <Button
          variant="link"
          aria-label={`对比详情：${row.original.sub_technology_name}`}
          onClick={() => setDetail(row.original)}
        >
          详情
        </Button>
      ),
    },
  ]
  const table = useReactTable({
    data: query.data?.results ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => String(r.id),
  })
  return (
    <>
      <Table aria-label="对比结果">
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((h) => (
                <TableHead key={h.id}>
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {query.isPending ? (
            <TableRow>
              <TableCell colSpan={columns.length}>
                <Loading label="正在读取对比结果…" />
              </TableCell>
            </TableRow>
          ) : query.isError ? (
            <TableRow>
              <TableCell colSpan={columns.length}>
                <div role="alert">
                  对比结果读取失败
                  <Button variant="link" onClick={() => void query.refetch()}>
                    重试结果
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ) : table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((c) => (
                  <TableCell key={c.id}>
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length}>暂无对比结果</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <nav
        aria-label="结果分页"
        className="flex items-center justify-center gap-3"
      >
        <Button
          variant="outline"
          disabled={page === 1 || query.isFetching}
          onClick={() => setPage(page - 1)}
        >
          上一页
        </Button>
        <span>
          第{page}页，共{query.data?.count ?? 0}条
        </span>
        <Button
          variant="outline"
          disabled={
            !query.data || page * 10 >= query.data.count || query.isFetching
          }
          onClick={() => setPage(page + 1)}
        >
          下一页
        </Button>
      </nav>
      <Dialog
        open={detail != null}
        onOpenChange={(v) => {
          if (!v) setDetail(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>对比详情</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <dl>
                <dt>执行动作</dt>
                <dd>{detail.sub_technology_name}</dd>
                <dt>防御结论</dt>
                <dd>
                  {detail.conclusion === '内容一致'
                    ? '数据一致，可能未采取防御措施或者防御无效'
                    : detail.conclusion}
                </dd>
              </dl>
              <div className="grid gap-3 sm:grid-cols-2">
                <section className="space-y-2 rounded border p-3">
                  <h4 className="font-semibold">未防御攻击结果数据</h4>
                  <ResultJson value={detail.undefended_return ?? {}} />
                </section>
                <section className="space-y-2 rounded border p-3">
                  <h4 className="font-semibold">防御后攻击结果数据</h4>
                  <ResultJson value={detail.defended_return ?? {}} />
                </section>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
function ResultJson({ value }: { value: unknown }) {
  if (value && typeof value === 'object' && Object.keys(value).length === 0)
    return <code>{JSON.stringify(value)}</code>
  if (value === null || typeof value !== 'object')
    return <code className="break-all">{JSON.stringify(value)}</code>
  return (
    <div className="space-y-1 font-mono text-xs">
      {Object.entries(value).map(([key, item]) =>
        item !== null && typeof item === 'object' ? (
          <details key={key} open>
            <summary className="cursor-pointer">{key}</summary>
            <div className="border-l pl-3">
              <ResultJson value={item} />
            </div>
          </details>
        ) : (
          <div key={key} className="break-all">
            {key}: <ResultJson value={item} />
          </div>
        ),
      )}
    </div>
  )
}
