import { useState } from 'react'
import { useForm, useStore } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Button } from '@workspace/ui/components/button'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { Textarea } from '@workspace/ui/components/textarea'
import { Input } from '@workspace/ui/components/input'
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldError,
} from '@workspace/ui/components/field'
import {
  getBehavior,
  getToolVersions,
  uploadBehavior,
  scriptCommand,
  scriptBase,
} from '../api/blue-script'
import { blueId, type BlueId } from '../api/blue-team'
import { usePageSignal } from '../auth/use-page-signal'
import { blueError } from './feedback'
import { ScriptInput } from './ScriptFields'
import type { GraphNodeProps } from './ScriptConfigDialog'
export function BehaviorConfig(props: GraphNodeProps) {
  const query = useQuery({
    queryKey: ['blue-script', props.scenarioId, 'behavior', props.node.data.id],
    queryFn: async ({ signal }) => {
      const [behavior, tools] = await Promise.all([
        getBehavior(props.scenarioId, props.node.data.id as BlueId, signal),
        getToolVersions(signal),
      ])
      return { behavior, tools }
    },
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
  if (query.isPending) return <Loading label="正在读取模拟配置…" />
  if (query.isError)
    return (
      <div role="alert">
        模拟配置读取失败
        <Button variant="link" onClick={() => void query.refetch()}>
          重试模拟配置
        </Button>
      </div>
    )
  return <BehaviorForm {...props} value={query.data} />
}
type BehaviorValues = {
  id: BlueId
  topo_node?: BlueId | null
  tool_type: 1 | 2
  tool_detail: { tool_id?: BlueId; version_ids?: BlueId[]; file?: string }[]
  interpreter: number
  content: string
}
function BehaviorForm({
  scenarioId,
  node,
  close,
  change,
  value,
}: GraphNodeProps & {
  value: {
    behavior: Awaited<ReturnType<typeof getBehavior>>
    tools: Awaited<ReturnType<typeof getToolVersions>>
  }
}) {
  const signalForPage = usePageSignal()
  const [uploading, setUploading] = useState(false),
    [filename, setFilename] = useState(value.behavior.filename ?? '')
  const schema = z
    .object({
      id: blueId,
      topo_node: blueId.or(z.literal('')).nullable().optional(),
      tool_type: z.union([z.literal(1), z.literal(2)]),
      tool_detail: z.array(
        z.object({
          tool_id: blueId.optional(),
          version_ids: z.array(blueId).optional(),
          file: z.string().optional(),
        }),
      ),
      interpreter: z.number().int().min(1).max(3),
      content: z.string(),
    })
    .superRefine((value, ctx) => {
      if (
        !value.tool_detail.length ||
        (value.tool_type === 2 && !value.tool_detail[0]?.file) ||
        (value.tool_type === 1 &&
          value.tool_detail.some(
            (item) => item.tool_id == null || !item.version_ids,
          ))
      )
        ctx.addIssue({
          code: 'custom',
          path: ['tool_detail'],
          message:
            value.tool_type === 1 ? '请选择工具或版本' : '请上传工具文件',
        })
    })
  const defaults: BehaviorValues = {
    id: value.behavior.id,
    topo_node: value.behavior.topo_node,
    tool_type: value.behavior.tool_type,
    tool_detail: value.behavior.tool_detail,
    interpreter: value.behavior.interpreter,
    content: value.behavior.content,
  }
  const form = useForm({
    defaultValues: defaults,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      const signal = signalForPage()
      await scriptCommand(
        `${scriptBase(scenarioId)}/draw/node/${encodeURIComponent(node.data.id as BlueId)}/behavior_simulate/`,
        value,
        signal,
      )
      if (!signal.aborted) close()
    },
  })
  const values = useStore(form.store, (state) => state.values)
  const rename = useForm({
    defaultValues: { name: node.data.name },
    validators: {
      onSubmit: z.object({
        name: z.string().trim().min(1, '请输入名称').max(50),
      }),
    },
    onSubmit: async ({ value }) => {
      const signal = signalForPage()
      const name = value.name.trim()
      await scriptCommand(
        `${scriptBase(scenarioId)}/draw/node/${encodeURIComponent(node.data.id as BlueId)}/rename/`,
        { name },
        signal,
      )
      if (signal.aborted) return
      await change((graph) => ({
        ...graph,
        nodes: graph.nodes.map((item) =>
          item.id === node.id
            ? { ...item, data: { ...item.data, name } }
            : item,
        ),
      }))
    },
  })
  const upload = async (file: File) => {
    const signal = signalForPage()
    setUploading(true)
    try {
      const url = await uploadBehavior(file, signal)
      if (signal.aborted) return
      form.setFieldValue('tool_detail', [{ file: url }])
      setFilename(file.name)
    } catch (error) {
      if (!signal.aborted) blueError(error)
    } finally {
      if (!signal.aborted) setUploading(false)
    }
  }
  const toggleTool = (toolId: BlueId, versions: BlueId[], checked: boolean) => {
    const next = values.tool_detail.filter((item) => item.tool_id !== toolId)
    if (checked) next.push({ tool_id: toolId, version_ids: versions })
    form.setFieldValue('tool_detail', next)
  }
  const toggleVersion = (
    toolId: BlueId,
    versionId: BlueId,
    checked: boolean,
  ) => {
    const existing =
      values.tool_detail.find((item) => item.tool_id === toolId)?.version_ids ??
      []
    const versions = checked
      ? [...existing, versionId]
      : existing.filter((id) => id !== versionId)
    toggleTool(toolId, versions, versions.length > 0)
  }
  return (
    <div className="space-y-5">
      <form
        noValidate
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void rename.handleSubmit().catch(blueError)
        }}
      >
        <rename.Field
          name="name"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <ScriptInput
                field={field}
                label="模拟节点名称"
                invalid={isInvalid}
                maxLength={50}
              />
            )
          }}
        />
        <rename.Subscribe selector={(state) => state.isSubmitting}>
          {(busy) => (
            <LoadingButton type="submit" loading={busy}>
              保存名称
            </LoadingButton>
          )}
        </rename.Subscribe>
      </form>
      <p className="text-sm text-muted-foreground">
        当剧本导入到具体场景应用时，节点行为模拟需增加执行节点配置。
      </p>
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
            name="tool_type"
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>工具来源</FieldLabel>
                  <select
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    aria-invalid={isInvalid}
                    disabled={uploading}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      field.handleChange(Number(event.target.value) as 1 | 2)
                      form.setFieldValue('tool_detail', [])
                      setFilename('')
                    }}
                    className="rounded border p-2"
                  >
                    <option value="1">工具库</option>
                    <option value="2">自行上传</option>
                  </select>
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          />
          <form.Field
            name="tool_detail"
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel>运行工具</FieldLabel>
                  {values.tool_type === 1 ? (
                    <div className="space-y-3 rounded border p-3">
                      {value.tools.length ? (
                        value.tools.map((tool) => (
                          <fieldset key={tool.value} className="space-y-2">
                            <legend>
                              <label className="flex gap-2">
                                <input
                                  type="checkbox"
                                  checked={
                                    !!values.tool_detail.find(
                                      (item) => item.tool_id === tool.value,
                                    ) &&
                                    (tool.children ?? []).every((version) =>
                                      values.tool_detail
                                        .find(
                                          (item) => item.tool_id === tool.value,
                                        )
                                        ?.version_ids?.includes(version.value),
                                    )
                                  }
                                  onBlur={field.handleBlur}
                                  onChange={(event) =>
                                    toggleTool(
                                      tool.value,
                                      (tool.children ?? []).map(
                                        (version) => version.value,
                                      ),
                                      event.target.checked,
                                    )
                                  }
                                />
                                {tool.label}全部版本
                              </label>
                            </legend>
                            {(tool.children ?? []).map((version) => (
                              <label
                                key={version.value}
                                className="ml-5 flex gap-2"
                              >
                                <input
                                  type="checkbox"
                                  checked={values.tool_detail.some(
                                    (item) =>
                                      item.tool_id === tool.value &&
                                      item.version_ids?.includes(version.value),
                                  )}
                                  onBlur={field.handleBlur}
                                  onChange={(event) =>
                                    toggleVersion(
                                      tool.value,
                                      version.value,
                                      event.target.checked,
                                    )
                                  }
                                />
                                {tool.label} / {version.label}
                              </label>
                            ))}
                          </fieldset>
                        ))
                      ) : (
                        <p>暂无工具版本</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <FieldLabel htmlFor="behavior-file">工具文件</FieldLabel>
                      <Input
                        id="behavior-file"
                        type="file"
                        disabled={uploading}
                        onBlur={field.handleBlur}
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          if (file) void upload(file)
                          event.target.value = ''
                        }}
                      />
                      {uploading ? (
                        <Loading label="正在上传工具文件…" variant="inline" />
                      ) : values.tool_detail[0]?.file ? (
                        <div className="flex items-center gap-2">
                          <span>{filename || values.tool_detail[0].file}</span>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              field.handleChange([])
                              setFilename('')
                            }}
                          >
                            移除文件
                          </Button>
                        </div>
                      ) : (
                        <p>尚未上传工具文件</p>
                      )}
                    </div>
                  )}
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          />
          <form.Field
            name="interpreter"
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>解释器</FieldLabel>
                  <select
                    id={field.name}
                    name={field.name}
                    aria-invalid={isInvalid}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(Number(event.target.value))
                    }
                    className="rounded border p-2"
                  >
                    <option value="1">bat</option>
                    <option value="2">bash</option>
                    <option value="3">Python</option>
                  </select>
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          />
          <form.Field
            name="content"
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>执行命令</FieldLabel>
                  <Textarea
                    id={field.name}
                    name={field.name}
                    aria-invalid={isInvalid}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
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
                disabled={busy || uploading}
                onClick={close}
              >
                取消
              </Button>
              <LoadingButton type="submit" loading={busy} disabled={uploading}>
                保存模拟配置
              </LoadingButton>
            </div>
          )}
        </form.Subscribe>
      </form>
    </div>
  )
}
