import { useEffect, useState } from 'react'
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
import {
  getNodeDefinitions,
  getNodeImages,
  uploadNodeLogo,
  asObject,
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
function withDefaults(config: ObjectValue, schema: ConfigSchema): ObjectValue {
  const next = structuredClone(config)
  for (const [key, definition] of Object.entries(schema.properties ?? {})) {
    if (key === '_config') continue
    if (next[key] === undefined && definition.default !== undefined)
      next[key] = structuredClone(definition.default)
    if (definition.type === 'object')
      next[key] = withDefaults(asObject(next[key]), definition)
    if (definition.type === 'array') {
      const count =
        key === 'ports'
          ? Number(
              asObject(asObject(schema.properties?._config).port_numbers)
                .default ?? 0,
            )
          : 0
      const items = Array.isArray(next[key])
        ? (next[key] as unknown[])
        : Array.from({ length: count }, () => ({}))
      next[key] = definition.items?.properties
        ? items.map((item) => withDefaults(asObject(item), definition.items!))
        : items
    }
  }
  return next
}
export function NodeConfiguration({
  info,
  logo,
  onSave,
  onError,
  signal,
  onDirtyChange,
}: {
  info: ObjectValue
  logo: unknown
  onSave: (value: ObjectValue) => Promise<void>
  onError: (error: unknown) => void
  signal: () => AbortSignal
  onDirtyChange: (dirty: boolean) => void
}) {
  const definitions = useQuery({
    queryKey: ['node-definitions'],
    queryFn: ({ signal }) => getNodeDefinitions(signal),
    retry: false,
  })
  const schema = definitions.data?.[String(info.engin)]
  if (definitions.isPending) return <p role="status">正在加载配置定义…</p>
  if (definitions.isError)
    return (
      <div role="alert">
        配置定义读取失败
        <Button onClick={() => void definitions.refetch()}>重试配置定义</Button>
      </div>
    )
  if (!schema) return <p role="alert">当前设备没有配置定义，无法编辑。</p>
  return (
    <ConfigurationFields
      info={info}
      logo={logo}
      schema={schema}
      onSave={onSave}
      onError={onError}
      signal={signal}
      onDirtyChange={onDirtyChange}
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
}: {
  info: ObjectValue
  logo: unknown
  schema: ConfigSchema
  onSave: (value: ObjectValue) => Promise<void>
  onError: (error: unknown) => void
  signal: () => AbortSignal
  onDirtyChange: (dirty: boolean) => void
}) {
  const [original] = useState(() =>
    withDefaults(asObject(info.config_info), schema),
  )
  const [currentLogo, setLogo] = useState(logo)
  const [uploading, setUploading] = useState(false)
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      Object.entries(original)
        .filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [key, (value as unknown[]).length]),
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
    defaultValues: flatten(original),
    validators: { onSubmit: z.record(z.string(), z.unknown()) },
    onSubmit: async ({ value }) => {
      const config = structuredClone(original)
      for (const [path, item] of Object.entries(value))
        assign(config, path, item)
      for (const [key, count] of Object.entries(counts))
        if (Array.isArray(config[key]))
          config[key] = (config[key] as unknown[]).slice(0, count)
      for (const key of ['base_info', 'host_net'])
        if (asObject(config[key]).gateway === '')
          asObject(config[key]).gateway = null
      try {
        await onSave({ ...info, logo: currentLogo, config_info: config })
      } catch (error) {
        onError(error)
      }
    },
  })
  const fieldsDirty = useStore(form.store, (state) => state.isDirty)
  const arrayDirty = Object.entries(counts).some(
    ([key, count]) => count !== (original[key] as unknown[])?.length,
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
        name={path}
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
                {Array.from({ length: counts[key] ?? 0 }, (_, index) => (
                  <fieldset className="space-y-3 border p-3" key={index}>
                    <legend>
                      {definition.description ?? key} {index + 1}
                    </legend>
                    {objectFields(`${key}/${index}`, definition.items ?? {})}
                  </fieldset>
                ))}
                {Number(info.engin) !== 10 ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        (counts[key] ?? 0) >=
                        Number(
                          asObject(
                            asObject(schema.properties?._config).port_numbers,
                          ).maxLength ?? Infinity,
                        )
                      }
                      onClick={() => {
                        const index = counts[key] ?? 0
                        for (const [name, field] of Object.entries(
                          definition.items?.properties ?? {},
                        ))
                          form.setFieldValue(
                            `${key}/${index}/${name}`,
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
                            `${key}/${index - 1}/mac`,
                          )
                          if (typeof previous === 'string') {
                            const parts = previous.split(':')
                            parts[parts.length - 1] = String(
                              Number(parts.at(-1)) + 1,
                            )
                            form.setFieldValue(
                              `${key}/${index}/mac`,
                              parts.join(':'),
                            )
                          }
                        }
                        setCounts({ ...counts, [key]: index + 1 })
                      }}
                    >
                      添加{definition.description ?? key}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        (counts[key] ?? 0) <=
                        Number(
                          asObject(
                            asObject(schema.properties?._config).port_numbers,
                          ).minLength ?? 0,
                        )
                      }
                      onClick={() =>
                        setCounts({
                          ...counts,
                          [key]: Math.max(0, (counts[key] ?? 0) - 1),
                        })
                      }
                    >
                      删除末项
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
