import { useEffect, useRef } from 'react'
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
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@workspace/ui/components/combobox'

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
    searchable?: boolean
    options?: Array<{ value: string; label: string }>
  }>
  schema: z.ZodType<Record<string, string>, Record<string, string>>
  submit: (value: Record<string, string>) => Promise<void>
  label: string
  onDirtyChange: (dirty: boolean) => void
}) {
  const container = useRef<HTMLFormElement>(null)
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
      ref={container}
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
              let input: React.ReactNode
              if (definition.options && definition.searchable) {
                input = (
                  <Combobox
                    items={definition.options}
                    value={
                      definition.options.find(
                        (option) => option.value === field.state.value,
                      ) ?? null
                    }
                    itemToStringLabel={(option) => option.label}
                    onValueChange={(option) =>
                      field.handleChange(option?.value ?? '')
                    }
                    filter={(option, query) =>
                      option.label.toLowerCase().includes(query.toLowerCase())
                    }
                  >
                    <ComboboxInput
                      id={field.name}
                      name={field.name}
                      aria-invalid={isInvalid}
                      onBlur={field.handleBlur}
                      placeholder="请选择节点模板"
                    />
                    <ComboboxContent container={container}>
                      <ComboboxEmpty>暂无匹配节点模板</ComboboxEmpty>
                      <ComboboxList>
                        {(option: { value: string; label: string }) => (
                          <ComboboxItem key={option.value} value={option}>
                            {option.label}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                )
              } else if (definition.options) {
                input = (
                  <select {...props} className="rounded border p-2">
                    <option value="">请选择</option>
                    {definition.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )
              } else {
                input = <Input {...props} maxLength={definition.maxLength} />
              }
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>
                    {definition.label}
                  </FieldLabel>
                  {input}
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
