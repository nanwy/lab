import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  getBlueSituation,
  saveBlueSituation,
  deleteBlueSituation,
  situationEventSchema,
  type SituationEvent,
  getDataRecords,
} from '../api/blue-data'
import { subscribeBlueSocket } from '../api/blue-socket'
import type { SituationNode } from '../api/blue-situation'
import { BlueNetwork } from './BlueNetwork'
import { SituationEditor } from './InitialSituation'
export function BlueDataPage({
  taskId,
  blueId,
}: {
  taskId: BlueId
  blueId: BlueId
}) {
  return (
    <DataSession key={`${taskId}:${blueId}`} taskId={taskId} blueId={blueId} />
  )
}
function DataSession({ taskId, blueId }: { taskId: BlueId; blueId: BlueId }) {
  const rounds = useQuery({
    queryKey: ['blue-data', String(taskId), String(blueId), 'rounds'],
    queryFn: ({ signal }) =>
      getBlueRounds(taskId, blueId, { nopage: 0 }, signal),
    retry: false,
    gcTime: 0,
  })
  return rounds.isPending ? (
    <Loading label="正在读取数据轮次…" />
  ) : rounds.isError ? (
    <p role="alert">
      数据轮次读取失败
      <Button variant="link" onClick={() => void rounds.refetch()}>
        重试轮次
      </Button>
    </p>
  ) : !rounds.data.length ? (
    <p>蓝军未执行，请先执行蓝军！</p>
  ) : (
    <Tabs defaultValue={String(rounds.data[0]!.id)}>
      <TabsList>
        {rounds.data.map((r) => (
          <TabsTrigger key={r.id} value={String(r.id)}>
            第{r.round}轮
          </TabsTrigger>
        ))}
      </TabsList>
      {rounds.data.map((r) => (
        <TabsContent key={r.id} value={String(r.id)}>
          <DataRound taskId={taskId} blueId={blueId} roundId={r.id} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
function DataRound(props: { taskId: BlueId; blueId: BlueId; roundId: BlueId }) {
  const [view, setView] = useState('network')
  return (
    <section className="space-y-4">
      <div className="flex gap-2">
        <Button
          variant={view === 'network' ? 'default' : 'outline'}
          onClick={() => setView('network')}
        >
          网络视图
        </Button>
        <Button
          variant={view === 'data' ? 'default' : 'outline'}
          onClick={() => setView('data')}
        >
          数据视图
        </Button>
      </div>
      {view === 'network' ? (
        <BlueNetwork {...props} />
      ) : (
        <DataSituation {...props} />
      )}
    </section>
  )
}
function mergeSituationEvent(
  tree: SituationNode[],
  event: SituationEvent,
): SituationNode[] {
  const { parent, ...node } = event
  const contains = (items: SituationNode[], id: string): boolean =>
    items.some(
      (item) => String(item.id) === id || contains(item.child ?? [], id),
    )
  if (parent != null && !contains(tree, String(parent)))
    throw new Error(`态势节点父节点不存在：${parent}`)
  let updated = false
  const update = (items: SituationNode[]): SituationNode[] =>
    items.map((item) => {
      if (String(item.id) === String(node.id)) {
        updated = true
        return { ...item, ...node, child: node.child ?? item.child }
      }
      return { ...item, child: item.child ? update(item.child) : undefined }
    })
  const next = update(tree)
  if (updated) return next
  if (parent == null) return [...next, node]
  const append = (items: SituationNode[]): SituationNode[] =>
    items.map((item) =>
      String(item.id) === String(parent)
        ? { ...item, child: [...(item.child ?? []), node] }
        : { ...item, child: item.child ? append(item.child) : undefined },
    )
  return append(next)
}
function DataSituation({
  taskId,
  blueId,
  roundId,
}: {
  taskId: BlueId
  blueId: BlueId
  roundId: BlueId
}) {
  const client = useQueryClient(),
    [connection, setConnection] = useState<string | null>(null)
  const reading = useRef<{ events: SituationEvent[] } | null>(null)
  const key = [
    'blue-data',
    String(taskId),
    String(blueId),
    String(roundId),
    'situation',
  ]
  const tree = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const window = { events: [] as SituationEvent[] }
      reading.current = window
      try {
        let snapshot = await getBlueSituation(taskId, blueId, roundId, signal)
        for (const event of window.events) {
          try {
            snapshot = mergeSituationEvent(snapshot, event)
          } catch (error) {
            if (!signal.aborted)
              setConnection(
                error instanceof Error ? error.message : '态势节点关系无效',
              )
          }
        }
        return snapshot
      } finally {
        if (reading.current === window) reading.current = null
      }
    },
    retry: false,
    gcTime: 0,
  })
  useEffect(
    () =>
      subscribeBlueSocket(
        taskId,
        blueId,
        'situation_node/',
        (raw) => {
          const event = situationEventSchema.safeParse(raw)
          if (!event.success) {
            setConnection('态势节点消息格式错误')
            return
          }
          if (reading.current) {
            reading.current.events.push(event.data)
            return
          }
          try {
            client.setQueryData<SituationNode[]>(
              [
                'blue-data',
                String(taskId),
                String(blueId),
                String(roundId),
                'situation',
              ],
              (previous) => {
                if (!previous)
                  throw new Error('态势基线尚未读取，无法应用实时节点')
                return mergeSituationEvent(previous, event.data)
              },
            )
          } catch (error) {
            setConnection(
              error instanceof Error ? error.message : '态势节点关系无效',
            )
          }
        },
        setConnection,
      ),
    [taskId, blueId, roundId, client],
  )
  return (
    <section className="space-y-4">
      {connection && <p role="status">{connection}</p>}
      <SituationEditor
        tree={tree}
        kind={3}
        save={(data, id, signal) =>
          saveBlueSituation(taskId, blueId, data, id, signal)
        }
        remove={(id, signal) => deleteBlueSituation(taskId, blueId, id, signal)}
      />
      <DataRecords taskId={taskId} blueId={blueId} roundId={roundId} />
    </section>
  )
}
function DataRecords({
  taskId,
  blueId,
  roundId,
}: {
  taskId: BlueId
  blueId: BlueId
  roundId: BlueId
}) {
  const [page, setPage] = useState(1),
    [open, setOpen] = useState(true)
  const query = useQuery({
    queryKey: [
      'blue-data',
      String(taskId),
      String(blueId),
      String(roundId),
      'records',
      page,
    ],
    queryFn: ({ signal }) =>
      getDataRecords(taskId, blueId, roundId, page, signal),
    retry: false,
    gcTime: 0,
  })
  type Row = Awaited<ReturnType<typeof getDataRecords>>['results'][number]
  const columns: ColumnDef<Row>[] = [
    { accessorKey: 'create_time', header: '时间' },
    { accessorKey: 'instruction_name', header: '指令' },
    {
      accessorKey: 'status',
      header: '执行状态',
      cell: ({ row }) =>
        ({ 1: '成功', 2: '失败', 3: '执行中' })[row.original.status],
    },
    {
      accessorKey: 'exec_return',
      header: '获取数据',
      cell: ({ row }) => JSON.stringify(row.original.exec_return),
    },
  ]
  const table = useReactTable({
    data: query.data?.results ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => String(r.id),
  })
  return (
    <section className="space-y-3 rounded border p-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">执行记录</h3>
        <Button variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? '收起' : '展开'}执行记录
        </Button>
      </div>
      {open && (
        <>
          <Table aria-label="数据执行记录">
            <TableHeader>
              {table.getHeaderGroups().map((g) => (
                <TableRow key={g.id}>
                  {g.headers.map((h) => (
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
                  <TableCell colSpan={4}>
                    <Loading label="正在读取执行记录…" />
                  </TableCell>
                </TableRow>
              ) : query.isError ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <p role="alert">
                      执行记录读取失败
                      <Button
                        variant="link"
                        onClick={() => void query.refetch()}
                      >
                        重试记录
                      </Button>
                    </p>
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
                  <TableCell colSpan={4}>暂无执行记录</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <nav
            aria-label="数据执行记录分页"
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
        </>
      )}
    </section>
  )
}
