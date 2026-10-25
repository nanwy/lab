import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { Button } from '@workspace/ui/components/button'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { Input } from '@workspace/ui/components/input'
import {
  Field,
  FieldLabel,
  FieldGroup,
  FieldError,
} from '@workspace/ui/components/field'
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
import { toast } from '@workspace/ui/components/sonner'
import type { BlueId } from '../api/blue-team'
import {
  forceBase,
  roleBase,
  forceCommand,
  getForces,
  getForceSystems,
  getForceTerminals,
  getForceAbilities,
} from '../api/blue-intelligent-forces'
import { usePageSignal } from '../auth/use-page-signal'
import { blueError } from './feedback'
type Role = Awaited<ReturnType<typeof getForces>>[number]
export function IntelligentForces({
  intelligentId,
  refreshed,
}: {
  intelligentId: BlueId
  refreshed: () => Promise<unknown>
}) {
  return (
    <ForceSession
      key={String(intelligentId)}
      intelligentId={intelligentId}
      refreshed={refreshed}
    />
  )
}
function ForceSession({
  intelligentId,
  refreshed,
}: {
  intelligentId: BlueId
  refreshed: () => Promise<unknown>
}) {
  const signalForPage = usePageSignal()
  const roles = useQuery({
    queryKey: ['blue-intelligent', String(intelligentId), 'forces'],
    queryFn: ({ signal }) => getForces(intelligentId, signal),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<Role | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Role | null>(null)
  const [removing, setRemoving] = useState(false)
  const current =
    roles.data?.find((r) => String(r.id) === selected) ?? roles.data?.[0]
  async function remove() {
    if (!deleting || removing) return
    const signal = signalForPage()
    setRemoving(true)
    try {
      await forceCommand(
        `${forceBase(intelligentId)}${encodeURIComponent(deleting.id)}/`,
        undefined,
        signal,
        'DELETE',
      )
      if (signal.aborted) return
      if (current?.id === deleting.id) setSelected(null)
      setDeleting(null)
      toast.success('删除兵力成功')
      await Promise.all([roles.refetch(), refreshed()])
    } catch (error) {
      if (!signal.aborted) blueError(error)
    } finally {
      if (!signal.aborted) setRemoving(false)
    }
  }
  return (
    <section aria-label="兵力配置" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">兵力配置</h3>
        <Button onClick={() => setEditing('new')}>添加兵力</Button>
      </div>
      {roles.isPending ? (
        <Loading label="正在读取兵力…" />
      ) : roles.isError ? (
        <div role="alert">
          兵力读取失败
          <Button variant="link" onClick={() => void roles.refetch()}>
            重试兵力
          </Button>
        </div>
      ) : !roles.data.length ? (
        <p>请添加兵力</p>
      ) : (
        <div className="flex gap-5 max-sm:flex-col">
          <div className="w-48 shrink-0 space-y-3">
            {roles.data.map((role) => (
              <div key={role.id} className="space-y-1 rounded border p-2">
                <Button
                  className="w-full"
                  variant={role.id === current?.id ? 'default' : 'outline'}
                  aria-label={`选择角色：${role.name}`}
                  onClick={() => setSelected(String(role.id))}
                >
                  {role.name}
                </Button>
                {role.id === current?.id && (
                  <div className="flex justify-between">
                    <Button
                      variant="ghost"
                      aria-label={`编辑角色：${role.name}`}
                      onClick={() => setEditing(role)}
                    >
                      编辑
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label={`删除角色：${role.name}`}
                      onClick={() => setDeleting(role)}
                    >
                      删除
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {current && (
            <RoleConfiguration
              key={String(current.id)}
              intelligentId={intelligentId}
              roleId={current.id}
            />
          )}
        </div>
      )}
      {editing && (
        <RoleName
          intelligentId={intelligentId}
          role={editing === 'new' ? null : editing}
          close={() => setEditing(null)}
          saved={async () => {
            await Promise.all([roles.refetch(), refreshed()])
          }}
        />
      )}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !removing) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除兵力</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除“{deleting?.name}”这个兵力吗？此操作不可恢复。
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
function RoleName({
  intelligentId,
  role,
  close,
  saved,
}: {
  intelligentId: BlueId
  role: Role | null
  close: () => void
  saved: () => Promise<unknown>
}) {
  const signalForPage = usePageSignal()
  const form = useForm({
    defaultValues: { name: role?.name ?? '' },
    validators: {
      onSubmit: z.object({
        name: z
          .string()
          .trim()
          .min(1, '请输入兵力角色名称')
          .max(20, '最多20字'),
      }),
    },
    onSubmit: async ({ value }) => {
      const signal = signalForPage()
      try {
        await forceCommand(
          role ? roleBase(intelligentId, role.id) : forceBase(intelligentId),
          { name: value.name },
          signal,
          role ? 'PUT' : 'POST',
          true,
        )
        if (signal.aborted) return
        toast.success(role ? '编辑兵力成功' : '添加兵力成功')
        await saved()
        if (!signal.aborted) close()
      } catch (error) {
        if (!signal.aborted) blueError(error)
      }
    },
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !form.state.isSubmitting) close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{role ? '编辑兵力' : '添加兵力'}</DialogTitle>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <FieldGroup>
            <form.Field
              name="name"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>兵力角色</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      maxLength={20}
                      aria-invalid={isInvalid}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(busy) => (
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={close}
                  >
                    取消
                  </Button>
                  <LoadingButton type="submit" loading={busy}>
                    保存
                  </LoadingButton>
                </div>
              )}
            </form.Subscribe>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}
function RoleConfiguration({
  intelligentId,
  roleId,
}: {
  intelligentId: BlueId
  roleId: BlueId
}) {
  return (
    <Tabs defaultValue="nodes" className="min-w-0 flex-1">
      <TabsList>
        <TabsTrigger value="nodes">节点配置</TabsTrigger>
        <TabsTrigger value="abilities">能力配置</TabsTrigger>
      </TabsList>
      <TabsContent value="nodes">
        <ForceTerminals intelligentId={intelligentId} roleId={roleId} />
      </TabsContent>
      <TabsContent value="abilities">
        <ForceAbilities intelligentId={intelligentId} roleId={roleId} />
      </TabsContent>
    </Tabs>
  )
}
type Terminal = Awaited<ReturnType<typeof getForceTerminals>>['results'][number]

function ForceTerminals({
  intelligentId,
  roleId,
}: {
  intelligentId: BlueId
  roleId: BlueId
}) {
  const signalForPage = usePageSignal()
  const [extracting, setExtracting] = useState(false)
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState<Terminal | null>(null)
  const [removing, setRemoving] = useState(false)
  const systems = useQuery({
    queryKey: [
      'blue-intelligent',
      String(intelligentId),
      'force',
      String(roleId),
      'terminal-systems',
    ],
    queryFn: ({ signal }) => getForceSystems(intelligentId, roleId, signal),
    retry: false,
  })
  const terminals = useQuery({
    queryKey: [
      'blue-intelligent',
      String(intelligentId),
      'force',
      String(roleId),
      'terminals',
      page,
    ],
    queryFn: ({ signal }) => getForceTerminals(intelligentId, roleId, signal),
    retry: false,
  })
  const extract = async () => {
    const signal = signalForPage()
    setExtracting(true)
    try {
      await forceCommand(
        `${roleBase(intelligentId, roleId)}instruction/terminal/common/`,
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
      await forceCommand(
        `${roleBase(intelligentId, roleId)}terminal/${encodeURIComponent(deleting.id)}/`,
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
              .map((tool) => `${tool.tool_name} ${tool.version_name}`)
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

function ForceAbilities({
  intelligentId,
  roleId,
}: {
  intelligentId: BlueId
  roleId: BlueId
}) {
  const config = useQuery({
    queryKey: [
      'blue-intelligent',
      String(intelligentId),
      'force',
      String(roleId),
      'abilities',
    ],
    queryFn: ({ signal }) => getForceAbilities(intelligentId, roleId, signal),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  return config.isPending ? (
    <Loading label="正在读取能力配置…" />
  ) : config.isError ? (
    <div role="alert">
      能力配置读取失败
      <Button variant="link" onClick={() => void config.refetch()}>
        重试能力配置
      </Button>
    </div>
  ) : !config.data.length ? (
    <p>暂无可用能力配置数据</p>
  ) : (
    <AbilityForm
      key={config.dataUpdatedAt}
      intelligentId={intelligentId}
      roleId={roleId}
      dimensions={config.data}
      saved={async () => {
        await config.refetch()
      }}
    />
  )
}
function AbilityForm({
  intelligentId,
  roleId,
  dimensions,
  saved,
}: {
  intelligentId: BlueId
  roleId: BlueId
  dimensions: Awaited<ReturnType<typeof getForceAbilities>>
  saved: () => Promise<unknown>
}) {
  const signalForPage = usePageSignal()
  const form = useForm({
    defaultValues: { dimensions },
    validators: {
      onSubmit: z.object({
        dimensions: z.array(
          z.object({
            id: z.union([z.string(), z.number()]),
            name: z.string(),
            count: z.number(),
            is_configured: z.boolean(),
          }),
        ),
      }),
    },
    onSubmit: async ({ value }) => {
      const signal = signalForPage()
      try {
        await forceCommand(
          `${roleBase(intelligentId, roleId)}ability_configuration/`,
          {
            dimension_ids: value.dimensions
              .filter((d) => d.is_configured)
              .map((d) => d.id),
          },
          signal,
        )
        if (signal.aborted) return
        toast.success('保存能力配置成功')
        await saved()
      } catch (error) {
        if (!signal.aborted) blueError(error)
      }
    },
  })
  return (
    <form
      className="max-w-lg space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        {dimensions.map((dimension, index) => (
          <form.Field
            key={dimension.id}
            name={`dimensions[${index}].is_configured`}
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field
                  data-invalid={isInvalid}
                  className="flex-row items-center justify-between rounded border p-3"
                >
                  <FieldLabel htmlFor={field.name}>
                    {dimension.name} ({dimension.count}个能力)
                  </FieldLabel>
                  <input
                    type="checkbox"
                    id={field.name}
                    name={field.name}
                    aria-invalid={isInvalid}
                    disabled={dimension.count === 0}
                    checked={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.checked)}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          />
        ))}
      </FieldGroup>
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(busy) => (
          <LoadingButton type="submit" loading={busy}>
            保存配置
          </LoadingButton>
        )}
      </form.Subscribe>
    </form>
  )
}
