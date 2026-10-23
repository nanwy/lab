import { useEffect, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import {
  Field,
  FieldLabel,
  FieldError,
  FieldGroup,
} from '@workspace/ui/components/field'
import { Input } from '@workspace/ui/components/input'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { z } from 'zod'
import {
  buildInterceptionRule,
  interceptionSchema,
  type InterceptionDraft,
} from '../api/traffic-interception'
import { PythonEditor } from './PythonEditor'

export function InterceptionFields({
  draft,
  name = '',
  needName = false,
  locked = false,
  protocols,
  submitLabel,
  submit,
  change,
  footer,
  showCode = true,
  disabled = false,
  hideSubmit = false,
}: {
  draft: InterceptionDraft
  name?: string
  needName?: boolean
  locked?: boolean
  protocols: string[]
  submitLabel: string
  submit: (value: InterceptionDraft & { name: string }) => Promise<unknown>
  change?: (draft: InterceptionDraft) => void
  footer?: (
    draft: InterceptionDraft,
    validate: () => boolean,
  ) => React.ReactNode
  showCode?: boolean
  disabled?: boolean
  hideSubmit?: boolean
}) {
  const form = useForm({
    defaultValues: { ...draft, name },
    validators: {
      onSubmit: interceptionSchema.extend({
        name: needName ? z.string().min(1, '请输入模板名称') : z.string(),
      }),
    },
    listeners: { onChange: ({ formApi }) => change?.(formApi.state.values) },
    onSubmit: async ({ value }) => {
      await submit(value)
    },
  })
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
      className="space-y-4"
    >
      <FieldGroup>
        {needName && (
          <form.Field
            name="name"
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>模板名称</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          />
        )}
        <form.Field
          name="protocol"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>协议</FieldLabel>
                <Input
                  list="interception-protocols"
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  disabled={locked}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                />
                <datalist id="interception-protocols">
                  {protocols
                    .filter((value) => value !== field.state.value)
                    .map((value) => (
                      <option key={value} value={value} />
                    ))}
                </datalist>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
        <form.Field
          name="src_ip"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>IP地址</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  disabled={locked}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
        <form.Field
          name="dst_port"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>端口</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  disabled={locked}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
      </FieldGroup>
      <form.Subscribe
        selector={(state) => state.values}
        children={(value) => <InterceptionRules draft={value} />}
      />
      <div hidden={!showCode}>
        <form.Field
          name="script"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel>拦截代码</FieldLabel>
                <PythonEditor
                  value={field.state.value}
                  readOnly={locked}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {!hideSubmit && (
          <form.Subscribe
            selector={(state) => state.isSubmitting}
            children={(isSubmitting) => (
              <LoadingButton
                type="submit"
                disabled={locked || disabled}
                loading={isSubmitting}
              >
                {submitLabel}
              </LoadingButton>
            )}
          />
        )}
        <form.Subscribe
          selector={(state) => state.values}
          children={(value) =>
            footer?.(value, () => {
              const result = interceptionSchema.safeParse(value)
              if (!result.success) {
                form.setFieldMeta('protocol', (previous) => ({
                  ...previous,
                  isTouched: true,
                }))
                form.setFieldMeta('script', (previous) => ({
                  ...previous,
                  isTouched: true,
                }))
                void form.validate('submit')
                return false
              }
              return true
            })
          }
        />
      </div>
    </form>
  )
}
function InterceptionRules({ draft }: { draft: InterceptionDraft }) {
  const [strategy, setStrategy] = useState({
    protocol: draft.protocol,
    src_ip: draft.src_ip,
    dst_port: draft.dst_port,
  })
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setStrategy({
          protocol: draft.protocol,
          src_ip: draft.src_ip,
          dst_port: draft.dst_port,
        }),
      200,
    )
    return () => clearTimeout(timer)
  }, [draft.protocol, draft.src_ip, draft.dst_port])
  const rule = useQuery({
    queryKey: [
      'interception-rule',
      strategy.protocol,
      strategy.src_ip,
      strategy.dst_port,
    ],
    queryFn: ({ signal }) =>
      buildInterceptionRule({ ...strategy, script: '' }, signal),
    enabled: !!(strategy.protocol && strategy.src_ip && strategy.dst_port),
    retry: false,
  })
  return (
    <section aria-label="具体规则">
      <p>具体规则：</p>
      {rule.isFetching ? (
        <p role="status">正在生成规则…</p>
      ) : rule.isError ? (
        <p role="alert">{rule.error.message}</p>
      ) : rule.data?.length ? (
        rule.data.map((value, index) => <p key={index}>{value}</p>)
      ) : (
        <p>请输入完整拦截策略以生成规则</p>
      )}
    </section>
  )
}
