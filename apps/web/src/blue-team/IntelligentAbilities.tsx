import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { z } from 'zod'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { Field, FieldLabel, FieldError } from '@workspace/ui/components/field'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { blueId, type BlueId } from '../api/blue-team'
import {
  getIntelligentAbilities,
  getAbilityDimensions,
  getImportAbilities,
  intelligentBase,
  intelligentCommand,
} from '../api/blue-intelligent'
import { usePageSignal } from '../auth/use-page-signal'
import { blueError } from './feedback'

type Props = { intelligentId: BlueId; refreshed: () => Promise<unknown> }
export function IntelligentAbilities({ intelligentId, refreshed }: Props) {
  const signalForPage = usePageSignal(),
    [importing, setImporting] = useState(false),
    [clearing, setClearing] = useState(false),
    [busy, setBusy] = useState(false)
  const query = useQuery({
    queryKey: ['intelligent', String(intelligentId), 'abilities'],
    queryFn: ({ signal }) => getIntelligentAbilities(intelligentId, signal),
    retry: false,
  })
  const refresh = async () => {
    await Promise.all([query.refetch(), refreshed()])
  }
  const clear = async () => {
    const signal = signalForPage()
    setBusy(true)
    try {
      await intelligentCommand(
        `${intelligentBase(intelligentId)}/ability_action/clear/`,
        undefined,
        signal,
      )
      if (signal.aborted) return
      setClearing(false)
      await refresh()
    } catch (e) {
      if (!signal.aborted) blueError(e)
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  return (
    <section className="space-y-4">
      <div className="flex justify-between">
        <h3 className="font-semibold">能力动作</h3>
        <div className="flex gap-2">
          <Button onClick={() => setImporting(true)}>导入能力</Button>
          <Button variant="outline" onClick={() => setClearing(true)}>
            清空能力
          </Button>
        </div>
      </div>
      {query.isPending ? (
        <Loading label="正在读取能力…" />
      ) : query.isError ? (
        <p role="alert">
          能力读取失败
          <Button variant="link" onClick={() => void query.refetch()}>
            重试
          </Button>
        </p>
      ) : query.data.length ? (
        <div className="flex gap-3 overflow-auto">
          {query.data.map((d) => (
            <section key={d.id} className="min-w-44 rounded border">
              <h4
                className="p-3 text-center"
                style={{
                  backgroundColor: d.color
                    ? `rgba(${d.color.r},${d.color.g},${d.color.b},${d.color.a})`
                    : 'rgba(0,123,255,1)',
                }}
              >
                {d.name}（{d.abilities.length}个能力）
              </h4>
              {d.abilities.map((a) => (
                <p key={a.id} className="border-t p-3 text-center">
                  {a.name}（{a.instruction_count}条指令）
                </p>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <p>暂无能力数据</p>
      )}
      {importing && (
        <AbilityImport
          intelligentId={intelligentId}
          close={() => setImporting(false)}
          saved={refresh}
        />
      )}
      <AlertDialog
        open={clearing}
        onOpenChange={(v) => {
          if (!busy) setClearing(v)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空能力动作</AlertDialogTitle>
            <AlertDialogDescription>
              确定清空所有能力动作？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setClearing(false)}
            >
              取消
            </Button>
            <LoadingButton loading={busy} onClick={() => void clear()}>
              确认清空
            </LoadingButton>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
function AbilityImport({
  intelligentId,
  close,
  saved,
}: {
  intelligentId: BlueId
  close: () => void
  saved: () => Promise<unknown>
}) {
  const signalForPage = usePageSignal(),
    [selectedDimension, setDimension] = useState<BlueId | null>(null),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [size, setSize] = useState(10)
  const dimensions = useQuery({
    queryKey: ['intelligent', 'dimensions'],
    queryFn: ({ signal }) => getAbilityDimensions(signal),
    retry: false,
  })
  const dimension = selectedDimension ?? dimensions.data?.[0]?.id
  const candidates = useQuery({
    queryKey: [
      'intelligent',
      String(intelligentId),
      'import',
      dimension,
      search,
      page,
      size,
    ],
    queryFn: ({ signal }) =>
      getImportAbilities(intelligentId, dimension!, search, page, size, signal),
    enabled: dimension != null,
    retry: false,
  })
  const form = useForm({
    defaultValues: { selection: {} as Record<string, BlueId[]> },
    validators: {
      onSubmit: z.object({
        selection: z
          .record(z.string(), z.array(blueId))
          .refine(
            (v) => Object.values(v).some((ids) => ids.length > 0),
            '请至少选择一项能力',
          ),
      }),
    },
    onSubmit: async ({ value }) => {
      const signal = signalForPage()
      try {
        await intelligentCommand(
          `${intelligentBase(intelligentId)}/ability_action/import/`,
          {
            dimensions: Object.entries(value.selection)
              .filter(([, ids]) => ids.length)
              .map(([id, ids]) => ({
                dimension_id: Number(id),
                ability_ids: ids,
              })),
          },
          signal,
          'truthy',
        )
        if (signal.aborted) return
        await saved()
        if (!signal.aborted) close()
      } catch (e) {
        if (!signal.aborted) blueError(e)
      }
    },
  })
  type Candidate = Awaited<
    ReturnType<typeof getImportAbilities>
  >['abilities'][number]
  const columns: ColumnDef<Candidate>[] = [
    { accessorKey: 'code', header: '编号' },
    { accessorKey: 'name', header: '能力名称' },
    { accessorKey: 'dimension_name', header: '能力维度' },
    { accessorKey: 'instruction_count', header: '指令数量' },
  ]
  const table = useReactTable({
    data: candidates.data?.abilities ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (r) => String(r.id),
  })
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) close()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>导入能力</DialogTitle>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field
            name="selection"
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              const selected = field.state.value[String(dimension)] ?? []
              const items = candidates.data?.abilities ?? []
              const all =
                items.length > 0 && items.every((a) => selected.includes(a.id))
              const update = (ids: BlueId[]) =>
                field.handleChange({
                  ...field.state.value,
                  [String(dimension)]: ids,
                })
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel>能力维度</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    {dimensions.isPending ? (
                      <Loading label="正在读取维度…" />
                    ) : dimensions.isError ? (
                      <p role="alert">维度读取失败</p>
                    ) : (
                      dimensions.data.map((d) => (
                        <Button
                          key={d.id}
                          type="button"
                          aria-label={`维度：${d.name}`}
                          variant={
                            String(d.id) === String(dimension)
                              ? 'default'
                              : 'outline'
                          }
                          onClick={() => {
                            setDimension(d.id)
                            setPage(1)
                            setSearch('')
                          }}
                        >
                          {d.name}（已选
                          {field.state.value[String(d.id)]?.length ?? 0}个）
                        </Button>
                      ))
                    )}
                  </div>
                  <div className="my-3 flex items-center gap-3">
                    <label htmlFor="ability-search">搜索能力</label>
                    <Input
                      id="ability-search"
                      maxLength={300}
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value)
                        setPage(1)
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!items.length}
                      onClick={() =>
                        update(
                          all
                            ? selected.filter(
                                (id) => !items.some((a) => a.id === id),
                              )
                            : [
                                ...new Set([
                                  ...selected,
                                  ...items.map((a) => a.id),
                                ]),
                              ],
                        )
                      }
                    >
                      {all ? '取消全选' : '全选'}
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {table.getHeaderGroups()[0]?.headers.map((h) => (
                          <TableHead key={h.id}>
                            {flexRender(
                              h.column.columnDef.header,
                              h.getContext(),
                            )}
                          </TableHead>
                        ))}
                        <TableHead>选择</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {candidates.isPending && dimension != null ? (
                        <TableRow>
                          <TableCell colSpan={5}>
                            <Loading label="正在读取能力清单…" />
                          </TableCell>
                        </TableRow>
                      ) : candidates.isError ? (
                        <TableRow>
                          <TableCell colSpan={5}>能力清单读取失败</TableCell>
                        </TableRow>
                      ) : table.getRowModel().rows.length ? (
                        table.getRowModel().rows.map((row) => (
                          <TableRow key={row.id}>
                            {row.getVisibleCells().map((c) => (
                              <TableCell key={c.id}>
                                {flexRender(
                                  c.column.columnDef.cell,
                                  c.getContext(),
                                )}
                              </TableCell>
                            ))}
                            <TableCell>
                              <input
                                type="checkbox"
                                id={`${field.name}-${dimension}-${row.id}`}
                                name={field.name}
                                aria-invalid={isInvalid}
                                checked={selected.includes(row.original.id)}
                                onBlur={field.handleBlur}
                                onChange={(e) =>
                                  update(
                                    e.target.checked
                                      ? [...selected, row.original.id]
                                      : selected.filter(
                                          (id) => id !== row.original.id,
                                        ),
                                  )
                                }
                              />
                              <label
                                className="sr-only"
                                htmlFor={`${field.name}-${dimension}-${row.id}`}
                              >
                                选择能力：{row.original.name}
                              </label>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5}>暂无能力</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  <nav
                    aria-label="能力分页"
                    className="my-3 flex items-center justify-center gap-3"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      disabled={page === 1 || candidates.isFetching}
                      onClick={() => setPage(page - 1)}
                    >
                      上一页
                    </Button>
                    <span>
                      第{page}页，共{candidates.data?.total ?? 0}条
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        !candidates.data ||
                        page * size >= candidates.data.total ||
                        candidates.isFetching
                      }
                      onClick={() => setPage(page + 1)}
                    >
                      下一页
                    </Button>
                    <label htmlFor="ability-size">每页</label>
                    <select
                      id="ability-size"
                      value={size}
                      onChange={(e) => {
                        setSize(Number(e.target.value))
                        setPage(1)
                      }}
                    >
                      {[10, 20, 50].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </nav>
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  <form.Subscribe selector={(s) => s.isSubmitting}>
                    {(busy) => (
                      <LoadingButton type="submit" loading={busy}>
                        保存所选 (
                        {Object.values(field.state.value).reduce(
                          (sum, ids) => sum + ids.length,
                          0,
                        )}
                        )
                      </LoadingButton>
                    )}
                  </form.Subscribe>
                </Field>
              )
            }}
          />
        </form>
      </DialogContent>
    </Dialog>
  )
}
