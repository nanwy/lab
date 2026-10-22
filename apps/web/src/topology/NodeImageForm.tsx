import { useEffect, useRef, useState } from 'react'
import { useForm, useStore } from '@tanstack/react-form'
import { z } from 'zod'
import { Button } from '@workspace/ui/components/button'
import { Textarea } from '@workspace/ui/components/textarea'
import { Input } from '@workspace/ui/components/input'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from '@workspace/ui/components/field'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { saveRuntimeImage, type NodeImage } from '../api/node-runtime-resources'
import { asObject, type ObjectValue } from '../api/topology-resources'

const groups = {
  open_service: {
    title: '开放服务',
    fields: {
      protocol: '协议',
      name: '服务',
      port: '端口',
      secondary_path: '路径',
    },
  },
  system_user: {
    title: '系统账号密码',
    fields: { username: '账号', passwrod: '密码' },
  },
  app_user: {
    title: '应用账号密码',
    fields: { username: '账号', passwrod: '密码' },
  },
  ip_config: {
    title: 'IP配置',
    fields: { ip: 'IP', subnet_mask: '子网掩码', gateway: '网关' },
  },
}
type Group = keyof typeof groups
const systems = [
  'Window操作机',
  'Liunx操作机',
  'Unix',
  '开放麒麟',
  '优麒麟',
  '深度',
  '统信',
  'Openeuler',
  'Startos',
]
export function NodeImageForm({
  image,
  id,
  uuid,
  signal,
  run,
  close,
  onDirtyChange,
}: {
  image: NodeImage
  id: string | number
  uuid: string
  signal: () => AbortSignal
  run: (work: () => Promise<unknown>) => Promise<void>
  close: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const [rows, setRows] = useState<Record<Group, number[]>>(
    () =>
      Object.fromEntries(
        Object.keys(groups).map((key) => [
          key,
          image[key as Group].length
            ? image[key as Group].map((_, index) => index)
            : [0],
        ]),
      ) as Record<Group, number[]>,
  )
  const nextRow = useRef(
    Math.max(
      1,
      ...Object.keys(groups).map((key) => image[key as Group].length),
    ),
  )
  const [initial] = useState(() => {
    const initial: Record<string, string> = {}
    for (const key of [
      'name',
      'file_path',
      'type',
      'ip_type',
      'property',
      'system_type',
      'desc',
      'start_config',
    ])
      initial[key] = image[key] == null ? '' : String(image[key])
    initial.file_path = image.file_path.split('.').slice(0, -1).join('.')
    for (const key of ['cpu', 'ram', 'disk'])
      initial[`config/${key}`] =
        image.config[key] == null ? '' : String(image.config[key])
    for (const key of Object.keys(groups) as Group[])
      for (const index of rows[key])
        for (const name of Object.keys(groups[key].fields))
          initial[`${key}/${index}/${name}`] = String(
            asObject(image[key][index])[name] ?? '',
          )
    return initial
  })
  const form = useForm({
    defaultValues: initial,
    validators: {
      onSubmit: z
        .record(z.string(), z.string())
        .refine((value) => !!value.name, {
          path: ['name'],
          message: '请输入镜像名称！',
        }),
    },
    onSubmit: async ({ value }) => {
      const body: NodeImage = {
        ...image,
        image: image.id,
        name: value.name!,
        file_path: value.file_path!,
        type: Number(value.type),
        ip_type: Number(value.ip_type),
        property: Number(value.property),
        system_type: value.system_type ? Number(value.system_type) : null,
        desc: value.desc!,
        start_config: value.start_config!,
        config: { ...image.config },
      }
      for (const key of ['cpu', 'ram', 'disk'])
        body.config[key] = value[`config/${key}`]
          ? Number(value[`config/${key}`])
          : null
      for (const key of Object.keys(groups) as Group[]) {
        const entries = rows[key].map((index) => {
          const item: ObjectValue = { ...asObject(image[key][index]) }
          for (const name of Object.keys(groups[key].fields))
            item[name] = value[`${key}/${index}/${name}`] ?? ''
          if (key === 'open_service' && item.port) item.port = Number(item.port)
          return item
        })
        // 原提交只过滤开放服务和IP配置的全空行，账号行原样发送（字段passwrod沿原写契约）。
        const filtered =
          key === 'open_service'
            ? entries.filter((item) => item.name || item.port)
            : key === 'ip_config'
              ? entries.filter(
                  (item) => item.ip || item.subnet_mask || item.gateway,
                )
              : entries
        Object.assign(body, { [key]: filtered })
      }
      try {
        await run(() => saveRuntimeImage(id, uuid, body, signal()))
        if (!signal().aborted) close()
      } catch {
        /* 统一API已提示，保留表单。 */
      }
    },
  })
  const dirty = useStore(form.store, (state) => state.isDirty)
  const ipType = useStore(form.store, (state) => state.values.ip_type)
  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])
  function field(
    name: string,
    label: string,
    inputProps: React.ComponentProps<typeof Input> = {},
  ) {
    return (
      <form.Field
        key={name}
        name={name}
        children={(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
              <Input
                {...inputProps}
                id={field.name}
                name={field.name}
                value={field.state.value ?? ''}
                onBlur={field.handleBlur}
                aria-invalid={isInvalid}
                onChange={(event) =>
                  field.handleChange(
                    name === 'file_path'
                      ? event.target.value.replace(/[\u4e00-\u9fa5]/g, '')
                      : event.target.value,
                  )
                }
              />
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </Field>
          )
        }}
      />
    )
  }
  function selectField(
    name: string,
    label: string,
    options: Array<{ value: string; label: string }>,
  ) {
    return (
      <form.Field
        key={name}
        name={name}
        children={(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
              <select
                id={field.name}
                name={field.name}
                value={field.state.value ?? ''}
                onBlur={field.handleBlur}
                aria-invalid={isInvalid}
                onChange={(event) => field.handleChange(event.target.value)}
                className="rounded border p-2"
              >
                <option value="">请选择</option>
                {options.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </Field>
          )
        }}
      />
    )
  }
  function textAreaField(name: string, label: string) {
    return (
      <form.Field
        key={name}
        name={name}
        children={(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
              <Textarea
                id={field.name}
                name={field.name}
                value={field.state.value ?? ''}
                onBlur={field.handleBlur}
                aria-invalid={isInvalid}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </Field>
          )
        }}
      />
    )
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        {field('name', '镜像名称', { maxLength: 100 })}
        {field('file_path', '镜像文件名称', { maxLength: 100 })}
        <div className="grid grid-cols-3 gap-2">
          {field('config/cpu', 'CPU(H)', { type: 'number', min: 1 })}
          {field('config/ram', '内存(MB)', { type: 'number', min: 1 })}
          {field('config/disk', '磁盘(GB)', { type: 'number', min: 1 })}
        </div>
        {selectField('type', '镜像类型', [
          { value: '1', label: '基础镜像' },
          { value: '5', label: '靶标镜像' },
        ])}
        {selectField('property', '镜像属性', [
          { value: '1', label: '公开' },
          { value: '2', label: '私有' },
        ])}
        {selectField(
          'system_type',
          '操作系统',
          systems.map((label, index) => ({ label, value: String(index + 1) })),
        )}
        {selectField('ip_type', 'IP类型', [
          { value: '1', label: 'DHCP' },
          { value: '2', label: '静态IP' },
        ])}
        {(Object.keys(groups) as Group[])
          .filter((key) => key !== 'ip_config' || ipType === '2')
          .map((key) => (
            <section key={key} className="space-y-3 rounded border p-3">
              <h3>{groups[key].title}</h3>
              {rows[key].map((index, order) => (
                <div key={index} className="space-y-2">
                  {Object.entries(groups[key].fields).map(([name, label]) => {
                    const path = `${key}/${index}/${name}`
                    const title = `${groups[key].title}${order + 1} ${label}`
                    if (key === 'open_service' && name === 'port')
                      return field(path, title, {
                        type: 'number',
                        min: 1,
                        max: 65535,
                      })
                    if (key === 'open_service' && name === 'name')
                      return field(path, title, { list: 'image-services' })
                    return field(path, title)
                  })}
                  {rows[key].length > 1 ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setRows((current) => ({
                          ...current,
                          [key]: current[key].filter((row) => row !== index),
                        }))
                        onDirtyChange(true)
                      }}
                    >
                      删除{groups[key].title}
                      {order + 1}
                    </Button>
                  ) : null}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const index = nextRow.current++
                  setRows((current) => ({
                    ...current,
                    [key]: [...current[key], index],
                  }))
                  onDirtyChange(true)
                }}
              >
                添加{groups[key].title}
              </Button>
            </section>
          ))}
        {textAreaField('desc', '镜像描述')}
        {textAreaField('start_config', '启动配置')}
      </FieldGroup>
      <datalist id="image-services">
        {['Web服务', 'MySQL服务', 'SSH服务', '远程桌面'].map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <form.Subscribe
        selector={(state) => state.isSubmitting}
        children={(isSubmitting) => (
          <LoadingButton type="submit" loading={isSubmitting} className="mt-4">
            保存镜像
          </LoadingButton>
        )}
      />
    </form>
  )
}
