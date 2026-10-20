import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm, useStore } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from '@workspace/ui/components/field'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { Switch } from '@workspace/ui/components/switch'
import {
  getNodeDefinitions,
  getNodeImages,
  uploadNodeLogo,
  asObject,
  normalizeNodeConfiguration,
  type ConfigSchema,
  type ObjectValue,
} from '../api/topology-resources'

function flatten(value: ObjectValue, prefix = ''): ObjectValue {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      const path = prefix ? `${prefix}/${key}` : key
      return item !== null && typeof item === 'object'
        ? Object.entries(flatten(item as ObjectValue, path))
        : [[path, item]]
    }),
  )
}
function assign(config: ObjectValue, path: string, value: unknown) {
  const keys = path.split('/')
  let target = config
  for (const key of keys.slice(0, -1)) {
    if (!target[key] || typeof target[key] !== 'object') target[key] = {}
    target = target[key] as ObjectValue
  }
  target[keys.at(-1)!] = value
}
export function NodeConfiguration({
  info,
  logo,
  onSave,
  onError,
  signal,
  onDirtyChange,
  isBlue,
  connectedPorts,
}: {
  info: ObjectValue
  logo: unknown
  onSave: (value: ObjectValue, isBlue: boolean) => Promise<void>
  onError: (error: unknown) => void
  signal: () => AbortSignal
  onDirtyChange: (dirty: boolean) => void
  isBlue: boolean
  connectedPorts: number[]
}) {
  const definitions = useQuery({
    queryKey: ['node-definitions'],
    queryFn: ({ signal }) => getNodeDefinitions(signal),
    retry: false,
  })
  const schema = definitions.data?.[String(info.engin)]
  const prepared = useMemo(() => {
    if (!schema) return undefined
    try {
      return normalizeNodeConfiguration(info.config_info, schema)
    } catch (error) {
      return error instanceof Error ? error : new Error('节点配置契约错误')
    }
  }, [info.config_info, schema])
  if (definitions.isPending) return <p role="status">正在加载配置定义…</p>
  if (definitions.isError)
    return (
      <div role="alert">
        配置定义读取失败
        <Button onClick={() => void definitions.refetch()}>重试配置定义</Button>
      </div>
    )
  if (!schema) return <p role="alert">当前设备没有配置定义，无法编辑。</p>
  if (prepared instanceof Error) return <p role="alert">{prepared.message}</p>
  return (
    <ConfigurationFields
      info={info}
      logo={logo}
      schema={schema}
      onSave={onSave}
      onError={onError}
      signal={signal}
      onDirtyChange={onDirtyChange}
      isBlue={isBlue}
      connectedPorts={connectedPorts}
      configuration={prepared!}
    />
  )
}
function ConfigurationFields({
  info,
  logo,
  schema,
  onSave,
  onError,
  signal,
  onDirtyChange,
  isBlue,
  connectedPorts,
  configuration,
}: {
  info: ObjectValue
  logo: unknown
  schema: ConfigSchema
  onSave: (value: ObjectValue, isBlue: boolean) => Promise<void>
  onError: (error: unknown) => void
  signal: () => AbortSignal
  onDirtyChange: (dirty: boolean) => void
  isBlue: boolean
  connectedPorts: number[]
  configuration: ObjectValue
}) {
  const [original] = useState(configuration)
  const [currentLogo, setLogo] = useState(logo)
  const [uploading, setUploading] = useState(false)
  const [rows, setRows] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(
      Object.entries(original)
        .filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [
          key,
          (value as unknown[]).map((_, index) => index),
        ]),
    ),
  )
  const nextRowId = useRef(
    Object.fromEntries(
      Object.entries(rows).map(([key, ids]) => [key, ids.length]),
    ),
  )
  const fields = Object.entries(schema.properties ?? {}).filter(
    ([key]) => key !== '_config',
  )
  const [tab, setTab] = useState(fields[0]?.[0] ?? '')
  const imageId = asObject(original.base_info).images_id
  const images = useQuery({
    queryKey: ['node-images', imageId],
    queryFn: ({ signal }) => getNodeImages(imageId as string | number, signal),
    enabled: typeof imageId === 'number' || typeof imageId === 'string',
    retry: false,
  })
  const form = useForm({
    defaultValues: { configuration: flatten(original), isBlue },
    validators: {
      onSubmit: z.object({
        configuration: z.record(z.string(), z.unknown()),
        isBlue: z.boolean(),
      }),
    },
    onSubmit: async ({ value }) => {
      const config = structuredClone(original)
      for (const [path, item] of Object.entries(value.configuration))
        assign(config, path, item)
      for (const [key, ids] of Object.entries(rows))
        if (Array.isArray(config[key]))
          config[key] = ids.map((index) => (config[key] as unknown[])[index])
      for (const key of ['base_info', 'host_net'])
        if (asObject(config[key]).gateway === '')
          asObject(config[key]).gateway = null
      try {
        await onSave(
          { ...info, logo: currentLogo, config_info: config },
          value.isBlue,
        )
      } catch (error) {
        onError(error)
      }
    },
  })
  const fieldsDirty = useStore(form.store, (state) => state.isDirty)
  const arrayDirty = Object.entries(rows).some(
    ([key, ids]) =>
      ids.length !== (original[key] as unknown[])?.length ||
      ids.some((id, index) => id !== index),
  )
  useEffect(() => {
    onDirtyChange(
      fieldsDirty || arrayDirty || currentLogo !== logo || uploading,
    )
    return () => onDirtyChange(false)
  }, [fieldsDirty, arrayDirty, currentLogo, logo, uploading, onDirtyChange])
  function input(path: string, definition: ConfigSchema, required: boolean) {
    return (
      <form.Field
        key={path}
        name={`configuration.${path}`}
        children={(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid
          const common = {
            id: field.name,
            name: field.name,
            'aria-invalid': isInvalid,
            onBlur: field.handleBlur,
            disabled:
              definition.read_only ||
              definition.format === 'data-url' ||
              path.startsWith('security_groups/'),
          }
          const value = field.state.value ?? definition.default ?? ''
          let control
          if (path.endsWith('/images'))
            control = (
              <select
                {...common}
                disabled
                value={String(value)}
                onChange={() => {}}
              >
                <option value={String(value)}>
                  {images.data?.name ?? String(value)}
                </option>
              </select>
            )
          else if (definition.enum)
            control = (
              <select
                {...common}
                value={String(value)}
                onChange={(event) =>
                  field.handleChange(
                    definition.enum!.find(
                      (item) => String(item) === event.target.value,
                    ),
                  )
                }
              >
                <option value="">请选择</option>
                {definition.enum.map((item, index) => (
                  <option key={index} value={String(item)}>
                    {String(item)}
                  </option>
                ))}
              </select>
            )
          else if (definition.type === 'boolean')
            control = (
              <Input
                {...common}
                type="checkbox"
                checked={Boolean(value)}
                onChange={(event) => field.handleChange(event.target.checked)}
              />
            )
          else if (definition.big)
            control = (
              <Textarea
                {...common}
                className="min-h-72"
                maxLength={definition.maxLength}
                value={String(value)}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            )
          else
            control = (
              <Input
                {...common}
                type={
                  definition.type === 'number' || definition.type === 'integer'
                    ? 'number'
                    : 'text'
                }
                maxLength={definition.maxLength}
                value={String(value)}
                onChange={(event) =>
                  field.handleChange(
                    definition.type === 'number' ||
                      definition.type === 'integer'
                      ? Number(event.target.value)
                      : event.target.value,
                  )
                }
              />
            )
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>
                {definition.description ?? path.split('/').at(-1)}
                {required ? ' *' : ''}
              </FieldLabel>
              {control}
              {definition.info ? (
                <p className="text-xs">{definition.info}</p>
              ) : null}
              {definition.format === 'data-url' ? (
                <p>原入口未实现此字段上传，保留原值。</p>
              ) : null}
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </Field>
          )
        }}
      />
    )
  }
  function objectFields(base: string, definition: ConfigSchema) {
    return Object.entries(definition.properties ?? {}).map(([key, field]) =>
      input(
        `${base}/${key}`,
        field,
        definition.required?.includes(key) ?? false,
      ),
    )
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="flex gap-2" role="tablist">
        {fields.map(([key, definition]) => (
          <Button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            variant={tab === key ? 'default' : 'outline'}
            onClick={() => setTab(key)}
          >
            {definition.description ?? key}
          </Button>
        ))}
      </div>
      {fields.map(([key, definition]) => (
        <div key={key} hidden={tab !== key}>
          {key === 'security_groups' ? (
            <p>原入口未提供安全组选项，现有配置保留。</p>
          ) : null}
          {key === 'base_info' && images.isError ? (
            <p role="alert">
              镜像名称读取失败
              <Button type="button" onClick={() => void images.refetch()}>
                重试镜像名称
              </Button>
            </p>
          ) : null}
          <FieldGroup>
            {definition.type === 'object' ? (
              objectFields(key, definition)
            ) : definition.type === 'array' ? (
              <>
                {(rows[key] ?? []).map((rowId, index) => (
                  <fieldset className="space-y-3 border p-3" key={rowId}>
                    <legend>
                      {definition.description ?? key} {index + 1}
                    </legend>
                    {objectFields(`${key}/${rowId}`, definition.items ?? {})}
                    {Number(info.engin) !== 10 ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={
                            (rows[key]?.length ?? 0) <=
                              Number(
                                asObject(
                                  asObject(schema.properties?._config)
                                    .port_numbers,
                                ).minLength ?? 0,
                              ) ||
                            (key === 'ports' &&
                              connectedPorts.some((port) => port >= index))
                          }
                          onClick={() =>
                            setRows((current) => ({
                              ...current,
                              [key]: current[key]!.filter((id) => id !== rowId),
                            }))
                          }
                        >
                          删除{definition.description ?? key} {index + 1}
                        </Button>
                        {key === 'ports' &&
                        connectedPorts.some((port) => port >= index) ? (
                          <p>
                            删除此行会改变已连接网卡的索引，请先删除关联链路。
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </fieldset>
                ))}
                {Number(info.engin) !== 10 ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        (rows[key]?.length ?? 0) >=
                        Number(
                          asObject(
                            asObject(schema.properties?._config).port_numbers,
                          ).maxLength ?? Infinity,
                        )
                      }
                      onClick={() => {
                        const index = nextRowId.current[key] ?? 0
                        nextRowId.current[key] = index + 1
                        for (const [name, field] of Object.entries(
                          definition.items?.properties ?? {},
                        ))
                          form.setFieldValue(
                            `configuration.${key}/${index}/${name}`,
                            field.default ??
                              (field.type === 'boolean'
                                ? false
                                : field.type === 'number' ||
                                    field.type === 'integer'
                                  ? 0
                                  : ''),
                          )
                        if (
                          asObject(definition).port_type === 'port' &&
                          index > 0
                        ) {
                          const previous = form.getFieldValue(
                            `configuration.${key}/${rows[key]?.at(-1)}/mac`,
                          )
                          if (typeof previous === 'string') {
                            const parts = previous.split(':')
                            parts[parts.length - 1] = String(
                              Number(parts.at(-1)) + 1,
                            )
                            form.setFieldValue(
                              `configuration.${key}/${index}/mac`,
                              parts.join(':'),
                            )
                          }
                        }
                        setRows((current) => ({
                          ...current,
                          [key]: [...(current[key] ?? []), index],
                        }))
                      }}
                    >
                      添加{definition.description ?? key}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <p>当前数据格式暂不支持，保留原值。</p>
            )}
          </FieldGroup>
        </div>
      ))}
      <form.Field
        name="isBlue"
        children={(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>蓝军设置</FieldLabel>
              <Switch
                id={field.name}
                name={field.name}
                checked={field.state.value}
                onBlur={field.handleBlur}
                aria-invalid={isInvalid}
                onCheckedChange={field.handleChange}
              />
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </Field>
          )
        }}
      />
      <Field>
        <FieldLabel htmlFor="node-logo">节点图标</FieldLabel>
        <Input
          id="node-logo"
          type="file"
          accept=".jpg,.png,.svg"
          disabled={uploading}
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            setUploading(true)
            try {
              setLogo(await uploadNodeLogo(file, signal()))
            } catch (error) {
              onError(error)
            } finally {
              setUploading(false)
            }
          }}
        />
        {typeof currentLogo === 'string' && currentLogo ? (
          <img className="size-12" src={currentLogo} alt="节点图标" />
        ) : null}
      </Field>
      <form.Subscribe
        selector={(state) => state.isSubmitting}
        children={(isSubmitting) => (
          <LoadingButton
            type="submit"
            disabled={uploading}
            loading={isSubmitting}
          >
            保存节点
          </LoadingButton>
        )}
      />
    </form>
  )
}
