import { useMemo, useRef, useState } from 'react'
import { useForm, useStore } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { z } from 'zod'
import { Button } from '@workspace/ui/components/button'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { Input } from '@workspace/ui/components/input'
import { Field, FieldLabel, FieldError } from '@workspace/ui/components/field'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@workspace/ui/components/table'
import {
  getInstructionCascade,
  getAction,
  getInstructions,
  getAbility,
  scriptCommand,
  scriptBase,
  type AbilityParameter,
  type InstructionCategory,
} from '../api/blue-script'
import type { BlueId } from '../api/blue-team'
import { usePageSignal } from '../auth/use-page-signal'
import type { GraphNodeProps } from './ScriptConfigDialog'
import { ScriptInput, ScriptSelect } from './ScriptFields'
import { blueError } from './feedback'
export function ActionConfig(props: GraphNodeProps) {
  const query = useQuery({
    queryKey: ['blue-script', props.scenarioId, 'action', props.node.data.id],
    queryFn: async ({ signal }) => {
      const [cascade, action] = await Promise.all([
        getInstructionCascade(signal),
        getAction(props.scenarioId, props.node.data.id as BlueId, signal),
      ])
      return { cascade, action }
    },
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
  if (query.isPending) return <Loading label="正在读取动作能力…" />
  if (query.isError)
    return (
      <div role="alert">
        动作能力读取失败
        <Button variant="link" onClick={() => void query.refetch()}>
          重试动作能力
        </Button>
      </div>
    )
  return <ActionForm {...props} value={query.data} />
}
function ActionForm({
  scenarioId,
  node,
  close,
  change,
  container,
  value,
}: GraphNodeProps & {
  value: {
    cascade: InstructionCategory[]
    action: Awaited<ReturnType<typeof getAction>>
  }
}) {
  const [confirmed, setConfirmed] = useState<BlueId>(
    value.action.sub_technology,
  )
  const signalForPage = usePageSignal()
  const client = useQueryClient()
  const choices = useMemo(
    () =>
      value.cascade.flatMap((tactic) =>
        (tactic.children ?? []).flatMap((technology) =>
          (technology.children ?? []).map((ability) => ({
            id: ability.id,
            label: `${tactic.name} / ${technology.name} / ${ability.name}`,
            ability,
            tactic,
          })),
        ),
      ),
    [value.cascade],
  )
  const form = useForm({
    defaultValues: { selected: value.action.sub_technology as BlueId },
    validators: {
      onSubmit: z.object({
        selected: z.union([z.string().min(1, '请选择能力动作'), z.number()]),
      }),
    },
    onSubmit: async ({ value }) => {
      const signal = signalForPage()
      const choice = choices.find(
        (item) => String(item.id) === String(value.selected),
      )
      if (!choice) throw new Error('请选择完整的三级能力')
      await scriptCommand(
        `${scriptBase(scenarioId)}/draw/node/${encodeURIComponent(node.data.id as BlueId)}/action/`,
        { action_id: choice.id },
        signal,
      )
      if (signal.aborted) return
      const background = choice.tactic.background
      await change((graph) => ({
        ...graph,
        nodes: graph.nodes.map((item) =>
          item.id === node.id
            ? {
                ...item,
                data: {
                  ...item.data,
                  name: choice.ability.name,
                  style: {
                    ...item.data.style,
                    ...(background
                      ? {
                          background: `rgba(${background.r},${background.g},${background.b},${background.a})`,
                        }
                      : {}),
                  },
                },
              }
            : item,
        ),
      }))
      if (!signal.aborted) {
        setConfirmed(choice.id)
        await client.invalidateQueries({
          queryKey: ['blue-script', scenarioId, 'instructions', node.data.id],
        })
      }
    },
  })
  const selected = useStore(form.store, (state) => state.values.selected)
  const ability = useQuery({
    queryKey: ['blue-ability', selected],
    queryFn: ({ signal }) => getAbility(selected, signal),
    enabled: selected !== '',
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
  return (
    <div className="space-y-5">
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit().catch(blueError)
        }}
      >
        <form.Field
          name="selected"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <ScriptSelect
                field={field}
                label="当前能力"
                invalid={isInvalid}
                options={choices}
                container={container}
              />
            )
          }}
        />
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(busy) => (
            <LoadingButton type="submit" loading={busy}>
              保存能力
            </LoadingButton>
          )}
        </form.Subscribe>
      </form>
      <ExecutionCount scenarioId={scenarioId} nodeId={node.data.id as BlueId} />
      {confirmed !== '' && (
        <InstructionTable
          key={String(confirmed)}
          scenarioId={scenarioId}
          nodeId={node.data.id as BlueId}
        />
      )}
      {selected !== '' &&
        (ability.isPending ? (
          <Loading label="正在读取输入输出样例…" />
        ) : ability.isError ? (
          <div role="alert">
            能力参数读取失败
            <Button variant="link" onClick={() => void ability.refetch()}>
              重试能力参数
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <ParameterSample
              title="输入数据样例"
              parameters={ability.data.input_params}
            />
            <ParameterSample
              title="输出数据样例"
              parameters={ability.data.output_params}
            />
          </div>
        ))}
      <Button variant="outline" onClick={close}>
        关闭
      </Button>
    </div>
  )
}
function ExecutionCount({
  scenarioId,
  nodeId,
}: {
  scenarioId: BlueId
  nodeId: BlueId
}) {
  const signalForPage = usePageSignal()
  const form = useForm({
    defaultValues: { retry_count: '' as number | '' },
    validators: {
      onSubmit: z.object({ retry_count: z.number().int().min(0).max(10) }),
    },
    onSubmit: async ({ value }) => {
      await scriptCommand(
        `${scriptBase(scenarioId)}/draw/node/${encodeURIComponent(nodeId)}/action/`,
        value,
        signalForPage(),
        'PATCH',
      )
    },
  })
  return (
    <form
      noValidate
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit().catch(blueError)
      }}
    >
      <form.Field
        name="retry_count"
        children={(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <ScriptInput
              field={field}
              label="执行次数"
              invalid={isInvalid}
              numeric
              min={0}
              max={10}
            />
          )
        }}
      />
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(busy) => (
          <LoadingButton type="submit" loading={busy}>
            保存执行次数
          </LoadingButton>
        )}
      </form.Subscribe>
    </form>
  )
}
type Instruction = Awaited<
  ReturnType<typeof getInstructions>
>['results'][number]
function InstructionTable({
  scenarioId,
  nodeId,
}: {
  scenarioId: BlueId
  nodeId: BlueId
}) {
  const [page, setPage] = useState(1),
    [editing, setEditing] = useState<BlueId | null>(null),
    [busy, setBusy] = useState<BlueId | null>(null)
  const signalForPage = usePageSignal()
  const query = useQuery({
    queryKey: ['blue-script', scenarioId, 'instructions', nodeId, page],
    queryFn: ({ signal }) => getInstructions(scenarioId, nodeId, page, signal),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
  const save = async (id: BlueId, body: { use?: boolean; weight?: number }) => {
    const signal = signalForPage()
    setBusy(id)
    try {
      await scriptCommand(
        `${scriptBase(scenarioId)}/draw/node/${encodeURIComponent(nodeId)}/action/instruct/${encodeURIComponent(id)}/`,
        body,
        signal,
        'PATCH',
        'id',
      )
      if (signal.aborted) return
      setEditing(null)
      await query.refetch()
    } finally {
      if (!signal.aborted) setBusy(null)
    }
  }
  const columns: ColumnDef<Instruction>[] = [
    { accessorKey: 'name', header: '指令名称' },
    { accessorKey: 'tool_name', header: '所属工具' },
    {
      accessorKey: 'operating_system',
      header: '适配系统',
      cell: ({ row }) => row.original.operating_system.join('、') || '--',
    },
    {
      id: 'use',
      header: '是否选择',
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`启用指令：${row.original.name}`}
          checked={row.original.use}
          disabled={busy !== null}
          onChange={(event) =>
            void save(row.original.id, { use: event.target.checked }).catch(
              blueError,
            )
          }
        />
      ),
    },
    {
      id: 'weight',
      header: '优先级',
      cell: ({ row }) =>
        editing === row.original.id ? (
          <PriorityEditor
            value={row.original.weight}
            save={(weight) => save(row.original.id, { weight })}
            cancel={() => setEditing(null)}
          />
        ) : (
          <Button
            variant="ghost"
            aria-label={`优先级：${row.original.name}`}
            disabled={busy !== null}
            onDoubleClick={() => setEditing(row.original.id)}
          >
            {row.original.weight || '--'}
          </Button>
        ),
    },
  ]
  const table = useReactTable({
    data: query.data?.results ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
  })
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">能力指令</h3>
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
          {query.isPending ? (
            <TableRow>
              <TableCell colSpan={columns.length}>
                <Loading label="正在读取能力指令…" />
              </TableCell>
            </TableRow>
          ) : query.isError ? (
            <TableRow>
              <TableCell colSpan={columns.length}>
                能力指令读取失败
                <Button variant="link" onClick={() => void query.refetch()}>
                  重试指令
                </Button>
              </TableCell>
            </TableRow>
          ) : !table.getRowModel().rows.length ? (
            <TableRow>
              <TableCell colSpan={columns.length}>暂无能力指令</TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <div className="flex items-center justify-center gap-3">
        <Button
          variant="outline"
          disabled={page === 1 || query.isFetching || busy !== null}
          onClick={() => setPage((current) => current - 1)}
        >
          上一页指令
        </Button>
        <span>第 {page} 页</span>
        <Button
          variant="outline"
          disabled={
            page * 10 >= (query.data?.count ?? 0) ||
            query.isFetching ||
            busy !== null
          }
          onClick={() => setPage((current) => current + 1)}
        >
          下一页指令
        </Button>
      </div>
    </div>
  )
}
function PriorityEditor({
  value,
  save,
  cancel,
}: {
  value: number | null | undefined
  save: (weight: number) => Promise<void>
  cancel: () => void
}) {
  const submitting = useRef(false)
  const form = useForm({
    defaultValues: { weight: value ?? ('' as number | '') },
    validators: {
      onSubmit: z.object({ weight: z.number().int().min(0).max(100000) }),
    },
    onSubmit: async ({ value }) => {
      if (submitting.current) return
      submitting.current = true
      try {
        if (typeof value.weight === 'number') await save(value.weight)
      } finally {
        submitting.current = false
      }
    },
  })
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit().catch(blueError)
      }}
    >
      <form.Field
        name="weight"
        children={(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>指令优先级</FieldLabel>
              <Input
                autoFocus
                id={field.name}
                name={field.name}
                type="number"
                min={0}
                max={100000}
                value={field.state.value}
                aria-invalid={isInvalid}
                onChange={(event) =>
                  field.handleChange(
                    event.target.value === '' ? '' : Number(event.target.value),
                  )
                }
                onBlur={() => {
                  field.handleBlur()
                  void form.handleSubmit().catch(blueError)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    cancel()
                  }
                }}
              />
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </Field>
          )
        }}
      />
    </form>
  )
}
function example(parameters: AbilityParameter[]): Record<string, unknown> {
  return Object.fromEntries(
    parameters.map((parameter) => [
      parameter.param_name,
      parameter.field_type === 1
        ? ''
        : parameter.field_type === 2
          ? 1
          : parameter.field_type === 3
            ? parameter.child?.length
              ? [example(parameter.child)]
              : []
            : example(parameter.child ?? []),
    ]),
  )
}
function ParameterRows({ parameters }: { parameters: AbilityParameter[] }) {
  return (
    <ul className="space-y-2">
      {parameters.map((parameter, index) => (
        <li key={`${parameter.param_name}-${index}`} className="border-l pl-3">
          <strong>{parameter.param_name}</strong>：
          {parameter.required ? '必填' : '选填'} /{' '}
          {
            { 1: 'string', 2: 'int', 3: 'list', 4: 'object' }[
              parameter.field_type
            ]
          }
          {parameter.example !== undefined && (
            <span>
              ；示例：
              {typeof parameter.example === 'string'
                ? parameter.example
                : JSON.stringify(parameter.example)}
            </span>
          )}
          {parameter.child?.length ? (
            <ParameterRows parameters={parameter.child} />
          ) : null}
        </li>
      ))}
    </ul>
  )
}
function ParameterSample({
  title,
  parameters,
}: {
  title: string
  parameters: AbilityParameter[]
}) {
  return (
    <section className="space-y-2 rounded border p-3">
      <h3 className="font-semibold">{title}</h3>
      {parameters.length ? (
        <>
          <ParameterRows parameters={parameters} />
          <pre className="overflow-auto text-xs">
            {JSON.stringify(example(parameters), null, 2)}
          </pre>
        </>
      ) : (
        <p>暂无</p>
      )}
    </section>
  )
}
