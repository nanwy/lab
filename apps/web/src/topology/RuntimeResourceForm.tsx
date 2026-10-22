import { useEffect } from 'react'
import { useForm, useStore } from '@tanstack/react-form'
import { z } from 'zod'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from '@workspace/ui/components/field'
import { Input } from '@workspace/ui/components/input'
import { LoadingButton } from '@workspace/ui/components/loading-button'

// 快照名、NAT及模板选择都是字符串字段；仅共享这些实际重复的表单结构。
export function RuntimeResourceForm({
  initial,
  fields,
  schema,
  submit,
  label,
  onDirtyChange,
}: {
  initial: Record<string, string>
  fields: Array<{
    name: string
    label: string
    maxLength?: number
    options?: Array<{ value: string; label: string }>
  }>
  schema: z.ZodType<Record<string, string>, Record<string, string>>
  submit: (value: Record<string, string>) => Promise<void>
  label: string
  onDirtyChange: (dirty: boolean) => void
}) {
  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      await submit(value).catch(() => {})
    },
  })
  const dirty = useStore(form.store, (state) => state.isDirty)
  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        {fields.map((definition) => (
          <form.Field
            key={definition.name}
            name={definition.name}
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              const props = {
                id: field.name,
                name: field.name,
                value: field.state.value,
                onBlur: field.handleBlur,
                'aria-invalid': isInvalid,
                onChange: (
                  event: React.ChangeEvent<
                    HTMLInputElement | HTMLSelectElement
                  >,
                ) => field.handleChange(event.target.value),
              }
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>
                    {definition.label}
                  </FieldLabel>
                  {definition.options ? (
                    <select {...props} className="rounded border p-2">
                      <option value="">请选择</option>
                      {definition.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input {...props} maxLength={definition.maxLength} />
                  )}
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          />
        ))}
      </FieldGroup>
      <form.Subscribe
        selector={(state) => state.isSubmitting}
        children={(isSubmitting) => (
          <LoadingButton type="submit" loading={isSubmitting} className="mt-4">
            {label}
          </LoadingButton>
        )}
      />
    </form>
  )
}
