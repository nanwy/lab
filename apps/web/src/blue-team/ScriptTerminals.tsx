import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@workspace/ui/components/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import type { BlueId } from '../api/blue-team'
import {
  getTerminalSystems,
  getTerminals,
  scriptBase,
  scriptCommand,
} from '../api/blue-script'
import { usePageSignal } from '../auth/use-page-signal'
import { blueError } from './feedback'

type Terminal = Awaited<ReturnType<typeof getTerminals>>['results'][number]

export function ScriptTerminals({ scenarioId }: { scenarioId: BlueId }) {
  return <TerminalSession key={String(scenarioId)} scenarioId={scenarioId} />
}

function TerminalSession({ scenarioId }: { scenarioId: BlueId }) {
  const signalForPage = usePageSignal()
  const [extracting, setExtracting] = useState(false)
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState<Terminal | null>(null)
  const [removing, setRemoving] = useState(false)
  const systems = useQuery({
    queryKey: ['blue-script', String(scenarioId), 'terminal-systems'],
    queryFn: ({ signal }) => getTerminalSystems(scenarioId, signal),
    retry: false,
  })
  const terminals = useQuery({
    queryKey: ['blue-script', String(scenarioId), 'terminals', page],
    queryFn: ({ signal }) => getTerminals(scenarioId, page, signal),
    retry: false,
  })
  const extract = async () => {
    const signal = signalForPage()
    setExtracting(true)
    try {
      await scriptCommand(
        `${scriptBase(scenarioId)}/instruction/terminal/common/`,
        undefined,
        signal,
      )
      if (!signal.aborted) {
        toast.success('提取成功！')
        await terminals.refetch()
      }
    } catch (error) {
      if (!signal.aborted) blueError(error)
    } finally {
      if (!signal.aborted) setExtracting(false)
    }
  }
  const remove = async () => {
    if (!deleting || removing) return
    const signal = signalForPage()
    setRemoving(true)
    try {
      await scriptCommand(
        `${scriptBase(scenarioId)}/terminal/${encodeURIComponent(deleting.id)}/`,
        undefined,
        signal,
        'DELETE',
      )
      if (signal.aborted) return
      toast.success('删除成功')
      setDeleting(null)
      if (page > 1 && terminals.data?.results.length === 1) setPage(page - 1)
      else await terminals.refetch()
    } catch (error) {
      if (!signal.aborted) blueError(error)
    } finally {
      if (!signal.aborted) setRemoving(false)
    }
  }
  const columns: ColumnDef<Terminal>[] = [
    { accessorKey: 'system', header: '适配系统' },
    {
      accessorKey: 'tool_list',
      header: '运行工具',
      cell: ({ row }) =>
        row.original.tool_list.length
          ? row.original.tool_list
              .map((tool) => `${tool.tool__name} ${tool.version__name}`)
              .join('、')
          : '--',
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          aria-label={`删除终端：${row.original.system}`}
          onClick={() => setDeleting(row.original)}
        >
          删除
        </Button>
      ),
    },
  ]
  const table = useReactTable({
    data: terminals.data?.results ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
  })
  return (
    <section aria-label="蓝军终端" className="space-y-4">
      <h3 className="font-semibold">适配终端</h3>
      {systems.isPending ? (
        <Loading label="正在读取适配终端…" />
      ) : systems.isError ? (
        <div role="alert">
          适配终端读取失败
          <Button variant="link" onClick={() => void systems.refetch()}>
            重试适配终端
          </Button>
        </div>
      ) : systems.data.length ? (
        <div className="space-y-3">
          <p>{systems.data.join('、')}</p>
          <LoadingButton loading={extracting} onClick={() => void extract()}>
            提取共性终端
          </LoadingButton>
        </div>
      ) : (
        <p>当前指令和工具集暂无可运行终端</p>
      )}
      <h3 className="font-semibold">蓝军终端</h3>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id}>
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {terminals.isPending ? (
            <TableRow>
              <TableCell colSpan={columns.length}>
                <Loading label="正在读取蓝军终端…" />
              </TableCell>
            </TableRow>
          ) : terminals.isError ? (
            <TableRow>
              <TableCell colSpan={columns.length}>
                <div role="alert">
                  蓝军终端读取失败
                  <Button
                    variant="link"
                    onClick={() => void terminals.refetch()}
                  >
                    重试蓝军终端
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ) : table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length}>
                暂无共性终端，可尝试重新提取
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {terminals.data && terminals.data.count > 10 && (
        <nav
          aria-label="终端分页"
          className="flex items-center justify-center gap-3"
        >
          <Button
            variant="outline"
            disabled={page === 1 || terminals.isFetching}
            onClick={() => setPage(page - 1)}
          >
            上一页
          </Button>
          <span>
            第{page}页，共{terminals.data.count}条
          </span>
          <Button
            variant="outline"
            disabled={page * 10 >= terminals.data.count || terminals.isFetching}
            onClick={() => setPage(page + 1)}
          >
            下一页
          </Button>
        </nav>
      )}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !removing) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除终端</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除“{deleting?.system}”终端？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={removing}
              onClick={() => setDeleting(null)}
            >
              取消
            </Button>
            <LoadingButton loading={removing} onClick={() => void remove()}>
              确认删除
            </LoadingButton>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
