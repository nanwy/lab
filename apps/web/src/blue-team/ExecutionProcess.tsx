import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { Button } from '@workspace/ui/components/button'
import { Loading } from '@workspace/ui/components/loading'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@workspace/ui/components/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
} from '@workspace/ui/components/table'
import type { BlueId } from '../api/blue-team'
import { getBlueRounds } from '../api/blue-control'
import {
  getExecutionRecords,
  getExecutionLogs,
  getExecutionRun,
  subscribeExecution,
  type ExecutionLog,
  type ExecutionRun,
  type ExecutionRecord,
} from '../api/blue-execution'
import { ExecutionGraph } from './ExecutionGraph'
import { ResultJson } from './ControlRounds'
type Props = { taskId: BlueId; blueId: BlueId; scenarioId?: BlueId | null }
export function ExecutionProcess(props: Props) {
  return <ExecutionRounds key={`${props.taskId}:${props.blueId}`} {...props} />
}
function ExecutionRounds(props: Props) {
  const query = useQuery({
    queryKey: ['process-rounds', String(props.taskId), String(props.blueId)],
    queryFn: ({ signal }) =>
      getBlueRounds(props.taskId, props.blueId, { nopage: 0 }, signal),
    retry: false,
    gcTime: 0,
  })
  const [selected, setSelected] = useState<string | null>(null),
    current =
      query.data?.find((r) => String(r.id) === selected) ?? query.data?.[0]
  return query.isPending ? (
    <Loading label="正在读取执行轮次…" />
  ) : query.isError ? (
    <p role="alert">
      执行轮次读取失败
      <Button variant="link" onClick={() => void query.refetch()}>
        重试轮次
      </Button>
    </p>
  ) : !query.data.length ? (
    <p>蓝军未执行，请先执行蓝军！</p>
  ) : (
    <Tabs value={String(current?.id)} onValueChange={setSelected}>
      <TabsList>
        {query.data.map((r) => (
          <TabsTrigger key={r.id} value={String(r.id)}>
            第{r.round}轮
          </TabsTrigger>
        ))}
      </TabsList>
      {query.data.map((r, index) => (
        <TabsContent key={r.id} value={String(r.id)}>
          <ExecutionRound {...props} roundId={r.id} first={index === 0} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
function ExecutionRound({
  taskId,
  blueId,
  scenarioId,
  roundId,
  first,
}: Props & { roundId: BlueId; first: boolean }) {
  const [page, setPage] = useState(1),
    [detail, setDetail] = useState<ExecutionRecord | null>(null),
    [hideRecords, setHideRecords] = useState(false),
    [hideLogs, setHideLogs] = useState(false),
    [events, setEvents] = useState<ExecutionLog[]>([]),
    [run, setRun] = useState<ExecutionRun | null>(null),
    [connection, setConnection] = useState<string | null>('正在连接实时记录…')
  const records = useQuery({
    queryKey: [
      'execution',
      String(taskId),
      String(blueId),
      String(roundId),
      'records',
      page,
    ],
    queryFn: ({ signal }) =>
      getExecutionRecords(taskId, blueId, roundId, page, signal),
    retry: false,
    gcTime: 0,
  })
  const logs = useQuery({
    queryKey: [
      'execution',
      String(taskId),
      String(blueId),
      String(roundId),
      'logs',
    ],
    queryFn: ({ signal }) => getExecutionLogs(taskId, blueId, signal),
    retry: false,
    gcTime: 0,
  })
  const initialRun = useQuery({
    queryKey: [
      'execution',
      String(taskId),
      String(blueId),
      String(roundId),
      'run',
    ],
    queryFn: ({ signal }) => getExecutionRun(taskId, blueId, signal),
    enabled: first,
    retry: false,
    gcTime: 0,
  })
  const { refetch } = records

  useEffect(
    () =>
      subscribeExecution(
        taskId,
        blueId,
        (event) => {
          if (event.kind === 1)
            setEvents((v) => [
              {
                create_time: event.create_time,
                message: event.log_message,
                status: event.status,
                spend_time: event.spend_time,
              },
              ...v,
            ])
          else {
            setRun(event)
            void refetch()
          }
        },
        setConnection,
      ),
    [taskId, blueId, roundId, refetch],
  )
  const currentRun = run ?? initialRun.data
  const columns: ColumnDef<ExecutionRecord>[] = [
    {
      accessorKey: 'number_of_decisions',
      header: '决策次数',
      cell: ({ row }) => `第${row.original.number_of_decisions}次决策`,
    },
    { accessorKey: 'update_time', header: '决策时间' },
    { accessorKey: 'instruction_name', header: '执行动作' },
    {
      accessorKey: 'status',
      header: '决策状态',
      cell: ({ row }) =>
        row.original.status === 3
          ? '执行中'
          : row.original.status === 2
            ? '失败'
            : '成功',
    },
  ]
  const table = useReactTable({
    data: records.data?.results ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => String(r.id),
  })
  return (
    <section className="space-y-4">
      {connection && <p role="status">{connection}</p>}
      {first &&
        !run &&
        (initialRun.isPending ? (
          <Loading variant="inline" label="正在读取当前执行信息…" />
        ) : initialRun.isError ? (
          <p role="alert">
            当前执行信息读取失败
            <Button variant="link" onClick={() => void initialRun.refetch()}>
              重试执行信息
            </Button>
          </p>
        ) : null)}
      {currentRun?.number_of_decisions ? (
        <p>正在进行第{currentRun.number_of_decisions}次决策</p>
      ) : null}
      {scenarioId != null && (
        <ExecutionGraph
          scenarioId={scenarioId}
          current={currentRun?.exec_scenario_node_uid}
        />
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded border p-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">决策过程</h3>
            <Button variant="outline" onClick={() => setHideRecords((v) => !v)}>
              {hideRecords ? '展开' : '收起'}决策过程
            </Button>
          </div>
          {!hideRecords && (
            <>
              <Table aria-label="执行决策记录">
                <TableHeader>
                  {table.getHeaderGroups().map((g) => (
                    <TableRow key={g.id}>
                      {g.headers.map((h) => (
                        <TableHead key={h.id}>
                          {flexRender(
                            h.column.columnDef.header,
                            h.getContext(),
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {records.isPending ? (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Loading label="正在读取决策记录…" />
                      </TableCell>
                    </TableRow>
                  ) : records.isError ? (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <p role="alert">
                          决策记录读取失败
                          <Button
                            variant="link"
                            onClick={() => void records.refetch()}
                          >
                            重试记录
                          </Button>
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : table.getRowModel().rows.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        tabIndex={0}
                        key={row.id}
                        onClick={() => setDetail(row.original)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setDetail(row.original)
                        }}
                        className="cursor-pointer"
                      >
                        {row.getVisibleCells().map((c) => (
                          <TableCell key={c.id}>
                            {flexRender(
                              c.column.columnDef.cell,
                              c.getContext(),
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4}>暂无决策记录</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <nav
                aria-label="执行决策分页"
                className="flex items-center justify-center gap-3"
              >
                <Button
                  variant="outline"
                  disabled={page === 1 || records.isFetching}
                  onClick={() => setPage(page - 1)}
                >
                  上一页
                </Button>
                <span>
                  第{page}页，共{records.data?.count ?? 0}条
                </span>
                <Button
                  variant="outline"
                  disabled={
                    !records.data ||
                    page * 10 >= records.data.count ||
                    records.isFetching
                  }
                  onClick={() => setPage(page + 1)}
                >
                  下一页
                </Button>
              </nav>
            </>
          )}
        </section>
        <section className="space-y-3 rounded border p-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">执行记录</h3>
            <Button variant="outline" onClick={() => setHideLogs((v) => !v)}>
              {hideLogs ? '展开' : '收起'}执行记录
            </Button>
          </div>
          {!hideLogs &&
            (logs.isPending ? (
              <Loading label="正在读取执行日志…" />
            ) : logs.isError ? (
              <p role="alert">
                执行日志读取失败
                <Button variant="link" onClick={() => void logs.refetch()}>
                  重试日志
                </Button>
              </p>
            ) : events.length || logs.data.length ? (
              <ol className="max-h-80 space-y-2 overflow-auto">
                {[...events, ...logs.data].map((log, i) => (
                  <li key={i}>
                    <time>{log.create_time}</time> 执行{' '}
                    <span
                      className={
                        log.status === 1
                          ? 'text-green-700'
                          : log.status === 2
                            ? 'text-red-700'
                            : ''
                      }
                    >
                      {log.message}
                    </span>
                    {log.spend_time ? ` 耗时${log.spend_time}` : ''}
                  </li>
                ))}
              </ol>
            ) : (
              <p>暂无记录</p>
            ))}
        </section>
      </div>
      <Dialog
        open={detail != null}
        onOpenChange={(v) => {
          if (!v) setDetail(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>第{detail?.number_of_decisions}次决策</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="grid gap-3 sm:grid-cols-2">
              <section className="rounded border p-3">
                <h4>输入数据</h4>
                <ResultJson value={detail.exec_params?.data ?? {}} />
              </section>
              <section className="rounded border p-3">
                <h4>输出数据</h4>
                <ResultJson value={detail.exec_return ?? {}} />
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
