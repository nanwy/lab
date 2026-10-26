import { useState } from 'react'
import { useForm, useStore } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Button } from '@workspace/ui/components/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@workspace/ui/components/combobox'
import { Input } from '@workspace/ui/components/input'
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldError,
} from '@workspace/ui/components/field'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import {
  getSituationTypes,
  situationGraphData,
  type SituationNode,
} from '../api/blue-situation'
import type { BlueId } from '../api/blue-team'
import { usePageSignal } from '../auth/use-page-signal'
import { blueError } from './feedback'

type Values = {
  data_type: 1 | 2 | 3
  data_define: BlueId
  rows: { data_define: BlueId; define_value: string | number }[]
  values: (string | number)[]
}
const schema = z
  .object({
    data_type: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    data_define: z.union([z.string(), z.number()]),
    rows: z.array(
      z.object({
        data_define: z.union([z.string(), z.number()]),
        define_value: z.union([z.string(), z.number()]),
      }),
    ),
    values: z.array(z.union([z.string(), z.number()])),
  })
  .superRefine((value, ctx) => {
    if (
      value.data_type !== 1 &&
      value.data_define === '' &&
      !(value.data_type === 3 && value.values.length === 0)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['data_define'],
        message: '请选择数据块类型',
      })
    if (value.data_type === 3)
      value.values.forEach((item, index) => {
        if (!item)
          ctx.addIssue({
            code: 'custom',
            path: ['values', index],
            message: '请输入数据值',
          })
      })
    else
      value.rows.forEach((item, index) => {
        if (item.data_define === '')
          ctx.addIssue({
            code: 'custom',
            path: ['rows', index, 'data_define'],
            message: '请选择数据类型',
          })
        if (!item.define_value)
          ctx.addIssue({
            code: 'custom',
            path: ['rows', index, 'define_value'],
            message: '请输入数据值',
          })
      })
  })
function defaults(node?: SituationNode): Values {
  if (!node)
    return {
      data_type: 1,
      data_define: '',
      rows: [{ data_define: '', define_value: '' }],
      values: [''],
    }
  return {
    data_type: node.data_type,
    data_define:
      node.data_type === 3
        ? (node.define_value[0]?.data_define ?? '')
        : node.data_define,
    rows:
      node.data_type === 1
        ? [{ data_define: node.data_define, define_value: node.define_value }]
        : node.data_type === 2
          ? node.define_value.map((row) => ({ ...row }))
          : [{ data_define: '', define_value: '' }],
    values:
      node.data_type === 3
        ? [...(node.define_value[0]?.define_value ?? [])]
        : [''],
  }
}
export function SituationForm({
  save,
  kind,
  editing,
  parent,
  close,
  saved,
}: {
  save: (
    data: unknown,
    nodeId: BlueId | undefined,
    signal: AbortSignal,
  ) => Promise<void>
  kind: 2 | 3
  editing?: SituationNode
  parent?: SituationNode
  close: () => void
  saved: () => Promise<void>
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const signalForPage = usePageSignal()
  const types = useQuery({
    queryKey: ['blue-situation-types'],
    queryFn: ({ signal }) => getSituationTypes(signal),
    retry: false,
  })
  const form = useForm({
    defaultValues: defaults(editing),
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      const signal = signalForPage()
      const first = value.rows[0]
      if (!first) throw new Error('节点数据至少需要一行')
      const rows = value.rows.map((row) => ({ ...row }))
      const dataDefine =
        value.data_type === 1 ? first.data_define : value.data_define
      const defineValue =
        value.data_type === 1
          ? first.define_value
          : value.data_type === 2
            ? rows
            : editing?.data_type === 3 && value.values.length === 0
              ? []
              : [
                  {
                    ...(editing?.data_type === 3
                      ? editing.define_value[0]
                      : {}),
                    data_define: value.data_define,
                    define_value: value.values,
                  },
                ]
      const data = editing
        ? {
            ...situationGraphData(editing),
            data_define:
              editing.data_type === 3 && value.values.length === 0
                ? editing.data_define
                : dataDefine,
            define_value: defineValue,
          }
        : {
            parent: parent?.id ?? null,
            data_type: value.data_type,
            kind,
            data_define: value.data_type === 1 ? '' : value.data_define,
            data:
              value.data_type === 1
                ? rows
                : [{ data_define: '', define_value: '' }],
            define_value:
              value.data_type === 2
                ? rows
                : [{ data_define: '', define_value: '' }],
            array_value:
              value.data_type === 3
                ? [
                    {
                      data_define: value.data_define,
                      define_value: value.values,
                    },
                  ]
                : [{ data_define: '', define_value: [''] }],
          }
      await save(data, editing?.id, signal)
      if (signal.aborted) return
      await saved()
      if (!signal.aborted) close()
    },
  })
  const values = useStore(form.store, (state) => state.values)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent
        ref={setContainer}
        className="max-h-[90vh] overflow-auto sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{editing ? '编辑数据' : '数据录入'}</DialogTitle>
        </DialogHeader>
        {parent && <p>当前节点：{parent.define_name}</p>}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit().catch(blueError)
          }}
          className="space-y-4"
        >
          <FieldGroup>
            {!editing && (
              <form.Field
                name="data_type"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>数据类型</FieldLabel>
                      <select
                        id={field.name}
                        name={field.name}
                        aria-invalid={isInvalid}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(
                            Number(event.target.value) as 1 | 2 | 3,
                          )
                        }
                        className="rounded border p-2"
                      >
                        <option value="1">节点数据</option>
                        <option value="2">块数据</option>
                        <option value="3">块数组</option>
                      </select>
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  )
                }}
              />
            )}
            {types.isPending ? (
              <Loading label="正在加载数据类型…" variant="inline" />
            ) : types.isError ? (
              <div role="alert">
                数据类型读取失败
                <Button
                  type="button"
                  variant="link"
                  onClick={() => void types.refetch()}
                >
                  重试数据类型
                </Button>
              </div>
            ) : (
              <>
                {values.data_type !== 1 && (
                  <form.Field
                    name="data_define"
                    children={(field) => {
                      const isInvalid =
                        field.state.meta.isTouched && !field.state.meta.isValid
                      return (
                        <Field data-invalid={isInvalid}>
                          <FieldLabel htmlFor={field.name}>
                            数据块类型
                          </FieldLabel>
                          <SituationTypePicker
                            id={field.name}
                            value={field.state.value}
                            invalid={isInvalid}
                            onBlur={field.handleBlur}
                            onChange={field.handleChange}
                            options={types.data}
                            container={container}
                          />
                          {isInvalid && (
                            <FieldError errors={field.state.meta.errors} />
                          )}
                        </Field>
                      )
                    }}
                  />
                )}
                {values.data_type !== 3 ? (
                  <>
                    {values.rows.map((_, index) => (
                      <div
                        key={index}
                        className="grid gap-3 rounded border p-3 sm:grid-cols-[1fr_1fr_auto]"
                      >
                        <form.Field
                          name={`rows[${index}].data_define`}
                          children={(field) => {
                            const isInvalid =
                              field.state.meta.isTouched &&
                              !field.state.meta.isValid
                            return (
                              <Field data-invalid={isInvalid}>
                                <FieldLabel htmlFor={field.name}>
                                  字段{index + 1}数据类型
                                </FieldLabel>
                                <SituationTypePicker
                                  id={field.name}
                                  value={field.state.value}
                                  invalid={isInvalid}
                                  onBlur={field.handleBlur}
                                  onChange={field.handleChange}
                                  options={types.data}
                                  container={container}
                                />
                                {isInvalid && (
                                  <FieldError
                                    errors={field.state.meta.errors}
                                  />
                                )}
                              </Field>
                            )
                          }}
                        />
                        <form.Field
                          name={`rows[${index}].define_value`}
                          children={(field) => {
                            const isInvalid =
                              field.state.meta.isTouched &&
                              !field.state.meta.isValid
                            return (
                              <Field data-invalid={isInvalid}>
                                <FieldLabel htmlFor={field.name}>
                                  字段{index + 1}数据值
                                </FieldLabel>
                                <Input
                                  id={field.name}
                                  name={field.name}
                                  aria-invalid={isInvalid}
                                  value={field.state.value}
                                  onBlur={field.handleBlur}
                                  onChange={(event) =>
                                    field.handleChange(event.target.value)
                                  }
                                />
                                {isInvalid && (
                                  <FieldError
                                    errors={field.state.meta.errors}
                                  />
                                )}
                              </Field>
                            )
                          }}
                        />
                        {values.rows.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => form.removeFieldValue('rows', index)}
                          >
                            删除字段{index + 1}
                          </Button>
                        )}
                      </div>
                    ))}
                    {!(editing?.data_type === 1) && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          form.pushFieldValue('rows', {
                            data_define: '',
                            define_value: '',
                          })
                        }
                      >
                        添加字段
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    {values.values.map((_, index) => (
                      <div key={index} className="flex items-end gap-2">
                        <form.Field
                          name={`values[${index}]`}
                          children={(field) => {
                            const isInvalid =
                              field.state.meta.isTouched &&
                              !field.state.meta.isValid
                            return (
                              <Field data-invalid={isInvalid}>
                                <FieldLabel htmlFor={field.name}>
                                  数组值{index + 1}
                                </FieldLabel>
                                <Input
                                  id={field.name}
                                  name={field.name}
                                  aria-invalid={isInvalid}
                                  value={field.state.value}
                                  onBlur={field.handleBlur}
                                  onChange={(event) =>
                                    field.handleChange(event.target.value)
                                  }
                                />
                                {isInvalid && (
                                  <FieldError
                                    errors={field.state.meta.errors}
                                  />
                                )}
                              </Field>
                            )
                          }}
                        />
                        {values.values.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              form.removeFieldValue('values', index)
                            }
                          >
                            删除数组值{index + 1}
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => form.pushFieldValue('values', '')}
                    >
                      添加数组值
                    </Button>
                  </>
                )}
              </>
            )}
          </FieldGroup>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(pending) => (
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={close}
                >
                  取消
                </Button>
                <LoadingButton
                  type="submit"
                  loading={pending}
                  disabled={types.isPending || types.isError}
                >
                  保存
                </LoadingButton>
              </div>
            )}
          </form.Subscribe>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SituationTypePicker({
  id,
  value,
  invalid,
  onBlur,
  onChange,
  options,
  container,
}: {
  id: string
  value: BlueId
  invalid: boolean
  onBlur: () => void
  onChange: (value: BlueId) => void
  options: { id: BlueId; datatype: string; desc: string }[]
  container: HTMLDivElement | null
}) {
  return (
    <Combobox
      items={options}
      value={
        options.find((option) => String(option.id) === String(value)) ?? null
      }
      itemToStringLabel={(item) => `${item.datatype}（${item.desc}）`}
      onValueChange={(item) => onChange(item?.id ?? '')}
    >
      <ComboboxInput id={id} name={id} aria-invalid={invalid} onBlur={onBlur} />
      <ComboboxContent container={container}>
        <ComboboxEmpty>暂无匹配数据类型</ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item.id} value={item}>
              {item.datatype}（{item.desc}）
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
