import { ActionConfig } from './ScriptActionConfig'
import { BehaviorConfig } from './ScriptBehaviorConfig'
import { useState } from 'react'
import { useForm, useStore } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Button } from '@workspace/ui/components/button'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldError,
} from '@workspace/ui/components/field'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import {
  getLine,
  getPrevious,
  getDecisions,
  getBranch,
  getBranchActions,
  getCombinationParams,
  scriptBase,
  scriptCommand,
  type ScriptNode,
  type ScriptEdge,
} from '../api/blue-script'
import type { BlueId } from '../api/blue-team'
import type { ScriptGraphChange } from './ScriptConfiguration'
import type { ScriptTarget } from './ScriptCanvas'
import { usePageSignal } from '../auth/use-page-signal'
import { blueError } from './feedback'
import { ScriptInput, ScriptSelect } from './ScriptFields'
export function ScriptConfigDialog({
  scenarioId,
  target,
  close,
  change,
}: {
  scenarioId: BlueId
  target: ScriptTarget
  close: () => void
  change: ScriptGraphChange
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const title =
    target.kind === 'edge'
      ? '连线配置'
      : target.node.data.type === 2
        ? '数据分支'
        : target.node.data.type === 3
          ? '判断配置'
          : target.node.data.type === 4
            ? '动作能力'
            : '模拟节点配置'
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent
        ref={setContainer}
        className="max-h-[90vh] overflow-auto sm:max-w-4xl"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {target.kind === 'edge' ? (
          <LineConfig
            scenarioId={scenarioId}
            edge={target.edge}
            close={close}
            change={change}
            container={container}
          />
        ) : target.node.data.type === 2 ? (
          <BranchConfig
            scenarioId={scenarioId}
            node={target.node}
            close={close}
            container={container}
          />
        ) : target.node.data.type === 3 ? (
          <DecisionConfig
            scenarioId={scenarioId}
            node={target.node}
            close={close}
            container={container}
          />
        ) : target.node.data.type === 4 ? (
          <ActionConfig
            scenarioId={scenarioId}
            node={target.node}
            close={close}
            change={change}
            container={container}
          />
        ) : (
          <BehaviorConfig
            scenarioId={scenarioId}
            node={target.node}
            close={close}
            change={change}
            container={container}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
type NodeConfigProps = {
  scenarioId: BlueId
  node: ScriptNode
  close: () => void
  container: HTMLDivElement | null
}
type GraphNodeProps = NodeConfigProps & { change: ScriptGraphChange }
function Failed({ retry }: { retry: () => void }) {
  return (
    <div role="alert">
      配置读取失败
      <Button variant="link" onClick={retry}>
        重试配置
      </Button>
    </div>
  )
}
function LineConfig({
  scenarioId,
  edge,
  close,
  change,
  container,
}: {
  scenarioId: BlueId
  edge: ScriptEdge
  close: () => void
  change: ScriptGraphChange
  container: HTMLDivElement | null
}) {
  const query = useQuery({
    queryKey: ['blue-script', scenarioId, 'line', edge.data?.id],
    queryFn: ({ signal }) =>
      getLine(scenarioId, edge.data?.id as BlueId, signal),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
  if (query.isPending) return <Loading label="正在读取连线配置…" />
  if (query.isError) return <Failed retry={() => void query.refetch()} />
  return (
    <LineForm
      scenarioId={scenarioId}
      edge={edge}
      value={query.data}
      close={close}
      change={change}
      container={container}
    />
  )
}
function LineForm({
  scenarioId,
  edge,
  value,
  close,
  change,
  container,
}: {
  scenarioId: BlueId
  edge: ScriptEdge
  value: Awaited<ReturnType<typeof getLine>>
  close: () => void
  change: ScriptGraphChange
  container: HTMLDivElement | null
}) {
  const signalForPage = usePageSignal()
  const form = useForm({
    defaultValues: { ...value, brief: value.brief ?? '' },
    validators: {
      onSubmit: z.object({
        weight: z.number().int().min(0).max(100),
        sign: z.number().min(1).max(2),
        brief: z.string().max(50),
      }),
    },
    onSubmit: async ({ value }) => {
      const signal = signalForPage()
      await scriptCommand(
        `${scriptBase(scenarioId)}/draw/line/${encodeURIComponent(edge.data?.id as BlueId)}/`,
        value,
        signal,
      )
      if (signal.aborted) return
      await change((graph) => ({
        ...graph,
        edges: graph.edges.map((item) =>
          item.id !== edge.id
            ? item
            : {
                ...item,
                data: { ...item.data, ...value },
                label: value.brief || String(value.weight),
                style: {
                  ...(item.style as object),
                  stroke: value.sign === 1 ? '#1677ff' : '#d0021b',
                },
                markerEnd: {
                  ...(item.markerEnd as object),
                  color: value.sign === 1 ? '#1677ff' : '#d0021b',
                },
              },
        ),
      }))
      if (!signal.aborted) close()
    },
  })
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit().catch(blueError)
      }}
    >
      <FieldGroup>
        <form.Field
          name="weight"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <ScriptInput
                field={field}
                label="连线权重"
                invalid={isInvalid}
                numeric
                min={0}
                max={100}
              />
            )
          }}
        />
        <form.Field
          name="sign"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <ScriptSelect
                field={field}
                label="执行结果"
                invalid={isInvalid}
                options={[
                  { id: 1, label: '执行成功' },
                  { id: 2, label: '执行失败' },
                ]}
                container={container}
              />
            )
          }}
        />
        <form.Field
          name="brief"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <ScriptInput
                field={field}
                label="连线备注"
                invalid={isInvalid}
                maxLength={50}
              />
            )
          }}
        />
      </FieldGroup>
      <form.Subscribe selector={(state) => state.isSubmitting}>
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
              保存连线
            </LoadingButton>
          </div>
        )}
      </form.Subscribe>
    </form>
  )
}
function DecisionConfig({
  scenarioId,
  node,
  close,
  container,
}: NodeConfigProps) {
  const query = useQuery({
    queryKey: ['blue-script', scenarioId, 'decision', node.data.id],
    queryFn: async ({ signal }) => {
      const [previous, decision] = await Promise.all([
        getPrevious(scenarioId, node.data.id as BlueId, signal),
        getDecisions(scenarioId, node.data.id as BlueId, signal),
      ])
      return { previous, decision }
    },
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
  if (query.isPending) return <Loading label="正在读取判断配置…" />
  if (query.isError) return <Failed retry={() => void query.refetch()} />
  return (
    <DecisionForm
      {...{ scenarioId, node, close, container }}
      value={query.data}
    />
  )
}
function DecisionForm({
  scenarioId,
  node,
  close,
  container,
  value,
}: NodeConfigProps & {
  value: {
    previous: Awaited<ReturnType<typeof getPrevious>>
    decision: Awaited<ReturnType<typeof getDecisions>>
  }
}) {
  const signalForPage = usePageSignal()
  const defaults: {
    data_list: { define_id: string; id?: BlueId; data: string }[]
  } = {
    data_list: value.decision.length
      ? value.decision.map((item) => ({
          define_id:
            item.data_define_id == null ? '' : String(item.data_define_id),
          id: item.id,
          data: item.value,
        }))
      : [{ define_id: '', id: undefined as BlueId | undefined, data: '' }],
  }
  const form = useForm({
    defaultValues: defaults,
    validators: {
      onSubmit: z.object({
        data_list: z.array(
          z.object({
            define_id: z.string(),
            id: z.union([z.string(), z.number()]).optional(),
            data: z.string(),
          }),
        ),
      }),
    },
    onSubmit: async ({ value }) => {
      const signal = signalForPage()
      await scriptCommand(
        `${scriptBase(scenarioId)}/draw/node/${encodeURIComponent(node.data.id as BlueId)}/decision/`,
        value,
        signal,
      )
      if (!signal.aborted) close()
    },
  })
  const rows = useStore(form.store, (state) => state.values.data_list)
  const add = () => {
    if (rows.some((row) => !row.define_id || !row.data)) {
      blueError(new Error('请填写完整判断数据后添加'))
      return
    }
    form.pushFieldValue('data_list', { define_id: '', id: undefined, data: '' })
  }
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit().catch(blueError)
      }}
    >
      <p>结果数据 in 上一步输出变量</p>
      {rows.map((_, index) => (
        <div
          key={index}
          className="grid gap-2 rounded border p-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <form.Field
            name={`data_list[${index}].data`}
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <ScriptInput
                  field={field}
                  label={`判断${index + 1}结果数据`}
                  invalid={isInvalid}
                />
              )
            }}
          />
          <form.Field
            name={`data_list[${index}].define_id`}
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <ScriptSelect
                  field={field}
                  label={`判断${index + 1}上一步输出变量`}
                  invalid={isInvalid}
                  options={value.previous.map((item) => ({
                    id: String(item.id),
                    label: item.variable,
                  }))}
                  container={container}
                />
              )
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => form.removeFieldValue('data_list', index)}
          >
            删除判断{index + 1}
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={add}>
        添加判断
      </Button>
      <form.Subscribe selector={(state) => state.isSubmitting}>
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
              保存判断
            </LoadingButton>
          </div>
        )}
      </form.Subscribe>
    </form>
  )
}
function BranchConfig({ scenarioId, node, close, container }: NodeConfigProps) {
  const query = useQuery({
    queryKey: ['blue-script', scenarioId, 'branch', node.data.id],
    queryFn: async ({ signal }) => {
      const id = node.data.id as BlueId
      const [branch, actions, previous, types] = await Promise.all([
        getBranch(scenarioId, id, signal),
        getBranchActions(scenarioId, id, signal),
        getPrevious(scenarioId, id, signal),
        getCombinationParams(signal),
      ])
      return { branch, actions, previous, types }
    },
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
  if (query.isPending) return <Loading label="正在读取数据分支…" />
  if (query.isError) return <Failed retry={() => void query.refetch()} />
  return (
    <BranchForm
      {...{ scenarioId, node, close, container }}
      value={query.data}
    />
  )
}
function BranchForm({
  scenarioId,
  node,
  close,
  container,
  value,
}: NodeConfigProps & {
  value: {
    branch: Awaited<ReturnType<typeof getBranch>>
    actions: Awaited<ReturnType<typeof getBranchActions>>
    previous: Awaited<ReturnType<typeof getPrevious>>
    types: Awaited<ReturnType<typeof getCombinationParams>>
  }
}) {
  const signalForPage = usePageSignal()
  const nonempty = z.union([z.string().min(1, '请选择参数'), z.number()])
  const schema = z.object({
    data_list: z.array(
      z.object({
        define_id: nonempty,
        value: z.string().min(1, '请输入结果数据'),
        next_node: nonempty,
      }),
    ),
    transform_list: z.array(
      z.object({
        define_id: nonempty,
        value: z.string(),
        next_define_id: nonempty,
        select_defines: z.array(z.union([z.string(), z.number()])),
        rule: z.string().refine((value) => !!value.trim(), '请输入组合规则'),
      }),
    ),
  })
  const defaultValues: {
    data_list: { define_id: BlueId; value: string; next_node: BlueId }[]
    transform_list: {
      define_id: BlueId
      value: string
      next_define_id: BlueId
      select_defines: BlueId[]
      rule: string
    }[]
  } = value.branch
  const form = useForm({
    defaultValues,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      const signal = signalForPage()
      await scriptCommand(
        `${scriptBase(scenarioId)}/draw/node/${encodeURIComponent(node.data.id as BlueId)}/branch/`,
        value,
        signal,
      )
      if (!signal.aborted) close()
    },
  })
  const current = useStore(form.store, (state) => state.values)
  const add = (kind: 'data_list' | 'transform_list') => {
    if (
      kind === 'data_list'
        ? !schema.shape.data_list.safeParse(current.data_list).success
        : current.transform_list.some(
            (row) => !row.define_id || !row.next_define_id,
          )
    ) {
      blueError(new Error('请填写完整当前分支配置后添加'))
      return
    }
    if (kind === 'data_list')
      form.pushFieldValue(kind, { define_id: '', value: '', next_node: '' })
    else
      form.pushFieldValue(kind, {
        define_id: '',
        value: '',
        next_define_id: '',
        select_defines: [],
        rule: '',
      })
  }
  const previous = value.previous.map((item) => ({
      id: item.id,
      label: item.variable,
    })),
    types = value.types.map((item) => ({ id: item.id, label: item.variable }))
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit().catch(blueError)
      }}
    >
      <h3 className="font-semibold">参数组合</h3>
      {current.transform_list.map((_, index) => (
        <div
          key={index}
          className="grid gap-3 rounded border p-3 sm:grid-cols-2"
        >
          <form.Field
            name={`transform_list[${index}].define_id`}
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <ScriptSelect
                  field={field}
                  label={`组合${index + 1}历史参数`}
                  invalid={isInvalid}
                  options={types}
                  container={container}
                />
              )
            }}
          />
          <form.Field
            name={`transform_list[${index}].value`}
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <ScriptInput
                  field={field}
                  label={`组合${index + 1}参数值`}
                  invalid={isInvalid}
                />
              )
            }}
          />
          <form.Field
            name={`transform_list[${index}].select_defines`}
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel>组合{index + 1}可选择参数</FieldLabel>
                  {types.map((option) => (
                    <label key={option.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`${field.name}-${option.id}`}
                        checked={field.state.value.includes(option.id)}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(
                            event.target.checked
                              ? [...field.state.value, option.id]
                              : field.state.value.filter(
                                  (id) => id !== option.id,
                                ),
                          )
                        }
                      />
                      {option.label}
                    </label>
                  ))}
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          />
          <form.Field
            name={`transform_list[${index}].rule`}
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <ScriptInput
                  field={field}
                  label={`组合${index + 1}规则`}
                  invalid={isInvalid}
                />
              )
            }}
          />
          <form.Field
            name={`transform_list[${index}].next_define_id`}
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <ScriptSelect
                  field={field}
                  label={`组合${index + 1}下一步输入参数`}
                  invalid={isInvalid}
                  options={types}
                  container={container}
                />
              )
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => form.removeFieldValue('transform_list', index)}
          >
            删除组合{index + 1}
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => add('transform_list')}
      >
        添加参数组合
      </Button>
      <h3 className="font-semibold">条件判断</h3>
      {current.data_list.map((_, index) => (
        <div
          key={index}
          className="grid gap-3 rounded border p-3 sm:grid-cols-2"
        >
          <form.Field
            name={`data_list[${index}].define_id`}
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <ScriptSelect
                  field={field}
                  label={`条件${index + 1}上一步输出参数`}
                  invalid={isInvalid}
                  options={previous}
                  container={container}
                />
              )
            }}
          />
          <form.Field
            name={`data_list[${index}].value`}
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <ScriptInput
                  field={field}
                  label={`条件${index + 1}结果数据`}
                  invalid={isInvalid}
                />
              )
            }}
          />
          <form.Field
            name={`data_list[${index}].next_node`}
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <ScriptSelect
                  field={field}
                  label={`条件${index + 1}下一步能力动作`}
                  invalid={isInvalid}
                  options={value.actions.map((item) => ({
                    id: item.id,
                    label: item.name,
                  }))}
                  container={container}
                />
              )
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => form.removeFieldValue('data_list', index)}
          >
            删除条件{index + 1}
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => add('data_list')}>
        添加条件判断
      </Button>
      <form.Subscribe selector={(state) => state.isSubmitting}>
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
              保存分支
            </LoadingButton>
          </div>
        )}
      </form.Subscribe>
    </form>
  )
}
export type { NodeConfigProps, GraphNodeProps }
