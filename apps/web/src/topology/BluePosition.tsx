import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
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
import { Field, FieldLabel, FieldError } from '@workspace/ui/components/field'
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
} from '@workspace/ui/components/table'
import { toast } from '@workspace/ui/components/sonner'
import {
  getPositionTerminals,
  associatePosition,
  removePosition,
  positionTerminalSchema,
  terminalKey,
  terminalLabel,
  getPositionTools,
  runPositionTool,
  runPositionTools,
  type PositionTerminal,
  type PositionTool,
} from '../api/blue-position'
import type { BlueId } from '../api/blue-team'
import type { TopologyNode } from './x6-adapter'
import { usePageSignal } from '../auth/use-page-signal'
import { blueError } from '../blue-team/feedback'
type PositionCanvasNode = Pick<TopologyNode, 'id' | 'data'>
export function BluePosition({
  taskId,
  nodes,
  close,
  persist,
  unsaved,
  saving,
  retrySave,
}: {
  unsaved: boolean
  saving: boolean
  retrySave: (signal: AbortSignal) => Promise<void>
  taskId: BlueId
  nodes: PositionCanvasNode[]
  close: () => void
  persist: (
    node: string,
    terminal: PositionTerminal | null,
    signal: AbortSignal,
  ) => Promise<void>
}) {
  const signalForPage = usePageSignal()
  const [selected, setSelected] = useState(nodes[0]?.id ?? '')
  const current = nodes.find((n) => n.id === selected) ?? nodes[0]
  const query = useQuery({
    queryKey: ['blue-position', String(taskId), 'terminals'],
    queryFn: ({ signal }) => getPositionTerminals(taskId, signal),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-auto sm:max-w-5xl"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>蓝军配置</DialogTitle>
        </DialogHeader>
        {unsaved && (
          <div role="alert" className="flex items-center gap-2">
            关联关系已更新，拓扑尚未保存。
            <LoadingButton
              loading={saving}
              onClick={async () => {
                const signal = signalForPage()
                try {
                  await retrySave(signal)
                  if (!signal.aborted) await query.refetch()
                } catch (error) {
                  if (!signal.aborted) blueError(error)
                }
              }}
            >
              重试保存关联
            </LoadingButton>
          </div>
        )}
        {query.isPending ? (
          <Loading label="正在读取蓝军终端…" />
        ) : query.isError ? (
          <p role="alert">
            蓝军终端读取失败
            <Button variant="link" onClick={() => void query.refetch()}>
              重试终端
            </Button>
          </p>
        ) : (
          <>
            {query.data.unused_data.length > 0 && (
              <p>
                剩余未配置终端：
                {query.data.unused_data.map(terminalLabel).join('、')}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {nodes.map((node) => (
                <Button
                  key={node.id}
                  variant={current?.id === node.id ? 'default' : 'outline'}
                  onClick={() => setSelected(node.id)}
                >
                  {node.data.label}
                </Button>
              ))}
            </div>
            {current ? (
              <PositionNode
                key={current.id}
                taskId={taskId}
                node={current}
                options={query.data}
                refreshed={query.refetch}
                persist={persist}
                disabled={unsaved || saving}
              />
            ) : (
              <p>暂未配置蓝军节点</p>
            )}
          </>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={close}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
function PositionNode({
  taskId,
  node,
  options,
  refreshed,
  persist,
  disabled,
}: {
  disabled: boolean
  taskId: BlueId
  node: PositionCanvasNode
  options: Awaited<ReturnType<typeof getPositionTerminals>>
  refreshed: () => Promise<unknown>
  persist: (
    node: string,
    terminal: PositionTerminal | null,
    signal: AbortSignal,
  ) => Promise<void>
}) {
  const parsed = positionTerminalSchema.safeParse(node.data.raw.data?.blueInfo)
  const terminal = parsed.success ? parsed.data : null
  const [editing, setEditing] = useState(false),
    [deleting, setDeleting] = useState(false),
    [busy, setBusy] = useState(false)
  const signalForPage = usePageSignal()
  async function saveGraph(
    value: PositionTerminal | null,
    signal: AbortSignal,
  ) {
    await persist(node.id, value, signal)
    if (!signal.aborted) await refreshed()
  }
  async function associate(value: PositionTerminal) {
    const signal = signalForPage()
    await associatePosition(taskId, node.id, value, signal)
    if (signal.aborted) return
    setEditing(false)
    await saveGraph(value, signal)
    if (!signal.aborted) toast.success('关联成功！')
  }
  async function remove() {
    if (!terminal || busy) return
    const ids = options.used_data
      .filter((t) => terminalKey(t) === terminalKey(terminal))
      .map((t) => t.position_init_id)
    if (!ids.length || ids.some((id) => id == null)) {
      toast.error('请选择要取消关联的终端')
      return
    }
    const signal = signalForPage()
    setBusy(true)
    try {
      await removePosition(taskId, ids as BlueId[], signal)
      if (signal.aborted) return
      setDeleting(false)
      await saveGraph(null, signal)
      if (!signal.aborted) toast.success('操作成功！')
    } catch (error) {
      if (!signal.aborted) blueError(error)
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  const rawInfo = node.data.raw.data?.blueInfo
  if (
    rawInfo != null &&
    !parsed.success &&
    (typeof rawInfo !== 'object' ||
      Array.isArray(rawInfo) ||
      Object.keys(rawInfo).length > 0)
  )
    return <p role="alert">蓝军节点关联信息格式错误，无法读取终端关系。</p>
  return (
    <section className="space-y-4">
      {terminal ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span>关联终端：{terminalLabel(terminal)}</span>
            <Button
              variant="link"
              disabled={busy || disabled}
              onClick={() => setEditing(true)}
            >
              重新关联
            </Button>
            <Button
              variant="link"
              disabled={busy || disabled}
              onClick={() => setDeleting(true)}
            >
              取消关联
            </Button>
          </div>
          <PositionTools
            key={terminalKey(terminal)}
            taskId={taskId}
            terminal={terminal}
          />
        </>
      ) : (
        <p>
          当前蓝军节点未配置蓝军终端，请
          <Button
            variant="link"
            disabled={disabled}
            onClick={() => setEditing(true)}
          >
            选择蓝军终端
          </Button>
        </p>
      )}
      {editing && (
        <TerminalForm
          current={terminal}
          options={options}
          close={() => setEditing(false)}
          save={associate}
        />
      )}
      <AlertDialog
        open={deleting}
        onOpenChange={(open) => {
          if (!busy) setDeleting(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>解除蓝军节点与终端关系</AlertDialogTitle>
            <AlertDialogDescription>
              确认解除当前蓝军节点与终端关系？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeleting(false)}
            >
              取消
            </Button>
            <LoadingButton loading={busy} onClick={() => void remove()}>
              确认解除
            </LoadingButton>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
function TerminalForm({
  current,
  options,
  close,
  save,
}: {
  current: PositionTerminal | null
  options: Awaited<ReturnType<typeof getPositionTerminals>>
  close: () => void
  save: (terminal: PositionTerminal) => Promise<void>
}) {
  const values = [...options.used_data, ...options.unused_data]
  const currentKey = current ? terminalKey(current) : ''
  const form = useForm({
    defaultValues: { terminal: currentKey },
    validators: {
      onSubmit: z.object({ terminal: z.string().min(1, '请选择终端') }),
    },
    onSubmit: async ({ value }) => {
      const selected = values.find((t) => terminalKey(t) === value.terminal)
      if (!selected) return
      try {
        await save({ ...selected, terminal_id: terminalKey(selected) })
      } catch (error) {
        blueError(error)
      }
    },
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>关联终端</DialogTitle>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
          className="space-y-4"
        >
          <form.Field
            name="terminal"
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>选择终端</FieldLabel>
                  <select
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-invalid={isInvalid}
                    className="h-9 w-full rounded border bg-background px-3"
                  >
                    <option value="">请选择终端</option>
                    {values.map((t) => (
                      <option
                        key={terminalKey(t)}
                        value={terminalKey(t)}
                        disabled={
                          options.used_data.includes(t) &&
                          terminalKey(t) !== currentKey
                        }
                      >
                        {terminalLabel(t)}
                      </option>
                    ))}
                  </select>
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={close}>
              取消
            </Button>
            <form.Subscribe
              selector={(state) => state.isSubmitting}
              children={(isSubmitting) => (
                <LoadingButton type="submit" loading={isSubmitting}>
                  确定
                </LoadingButton>
              )}
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
function PositionTools({
  taskId,
  terminal,
}: {
  taskId: BlueId
  terminal: PositionTerminal
}) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [working, setWorking] = useState<string | null>(null)
  const signalForPage = usePageSignal()
  const query = useQuery({
    queryKey: [
      'blue-position',
      String(taskId),
      terminalKey(terminal),
      'tools',
      page,
      search,
    ],
    queryFn: ({ signal }) =>
      getPositionTools(taskId, terminal, { page, search }, signal),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  async function run(action: 'deploy' | 'check', tool?: PositionTool) {
    if (working) return
    if (tool?.run_status === 2) {
      toast.warning('请先启动环境！')
      return
    }
    if (tool && tool.id == null) {
      toast.warning('工具尚未生成部署记录，请启动环境后刷新状态')
      return
    }
    const signal = signalForPage()
    setWorking(`${action}:${tool?.id ?? 'all'}`)
    try {
      const message = tool
        ? await runPositionTool(taskId, tool.id!, action, signal)
        : await runPositionTools(taskId, terminal, action, signal)
      if (signal.aborted) return
      if (message) toast.success(message)
      await query.refetch()
    } catch (error) {
      if (!signal.aborted) blueError(error)
    } finally {
      if (!signal.aborted) setWorking(null)
    }
  }
  const columns: ColumnDef<PositionTool>[] = [
    {
      id: 'index',
      header: '序号',
      cell: ({ row }) => (page - 1) * 10 + row.index + 1,
    },
    {
      accessorKey: 'tool_name',
      header: '工具名称',
      cell: ({ row }) =>
        `${row.original.tool_name ?? ''} ${row.original.version_name ?? ''}`,
    },
    { accessorKey: 'instruction_count', header: '指令数量' },
    {
      accessorKey: 'tool_uuid',
      header: '工具标识',
      cell: ({ row }) => row.original.tool_uuid || '--',
    },
    {
      accessorKey: 'status',
      header: '工具状态',
      cell: ({ row }) =>
        typeof row.original.status === 'number'
          ? ((
              {
                1: '待部署',
                2: '部署完成',
                3: '部署中',
                4: '部署失败',
              } as Record<number, string>
            )[row.original.status] ?? '')
          : '',
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <LoadingButton
            variant="link"
            loading={working === `deploy:${row.original.id}`}
            disabled={working != null || row.original.status === 3}
            onClick={() => void run('deploy', row.original)}
          >
            部署
          </LoadingButton>
          <LoadingButton
            variant="link"
            loading={working === `check:${row.original.id}`}
            disabled={working != null}
            onClick={() => void run('check', row.original)}
          >
            检测
          </LoadingButton>
        </div>
      ),
    },
  ]
  const table = useReactTable({
    data: query.data?.results ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) =>
      row.id != null ? `record:${row.id}` : `tool:${row.tool_uuid}`,
  })
  if (query.isPending) return <Loading label="正在读取部署工具…" />
  if (query.isError)
    return (
      <p role="alert">
        部署工具读取失败
        <Button variant="link" onClick={() => void query.refetch()}>
          重试工具
        </Button>
      </p>
    )
  if (query.data === null)
    return (
      <p>
        当前蓝军节点未启动，请先启动节点，启动之后可进行工具布设！
        <Button variant="link" onClick={() => void query.refetch()}>
          刷新状态
        </Button>
      </p>
    )
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-3">
        <Input
          aria-label="工具关键字"
          placeholder="请输入关键字"
          maxLength={300}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          className="max-w-64"
        />
        <div className="flex gap-2">
          <LoadingButton
            loading={working === 'deploy:all'}
            disabled={working != null}
            onClick={() => void run('deploy')}
          >
            批量部署
          </LoadingButton>
          <LoadingButton
            loading={working === 'check:all'}
            disabled={working != null}
            onClick={() => void run('check')}
          >
            批量检测
          </LoadingButton>
          <Button
            variant="outline"
            disabled={working != null}
            onClick={() => void query.refetch()}
          >
            刷新状态
          </Button>
        </div>
      </div>
      <Table aria-label="蓝军部署工具">
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
          {table.getRowModel().rows.length ? (
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
              <TableCell colSpan={columns.length}>暂无工具</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <nav
        aria-label="蓝军工具分页"
        className="flex items-center justify-center gap-3"
      >
        <Button
          variant="outline"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          上一页
        </Button>
        <span>
          第{page}页，共{query.data.count}条
        </span>
        <Button
          variant="outline"
          disabled={page * 10 >= query.data.count}
          onClick={() => setPage(page + 1)}
        >
          下一页
        </Button>
      </nav>
    </div>
  )
}
