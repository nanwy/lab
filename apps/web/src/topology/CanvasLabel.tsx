import { useForm, useStore } from '@tanstack/react-form'
import { useEffect } from 'react'
import { z } from 'zod'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from '@workspace/ui/components/field'
import { Input } from '@workspace/ui/components/input'
import { LoadingButton } from '@workspace/ui/components/loading-button'

export function CanvasLabel({
  name,
  onSave,
  onDirtyChange,
  allowEmpty = false,
}: {
  name: string
  onSave: (name: string) => void
  onDirtyChange: (dirty: boolean) => void
  allowEmpty?: boolean
}) {
  const form = useForm({
    defaultValues: { name },
    validators: {
      onSubmit: z.object({
        name: allowEmpty ? z.string() : z.string().trim().min(1, '请输入名称'),
      }),
    },
    onSubmit: ({ value }) =>
      onSave(allowEmpty ? value.name : value.name.trim()),
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
        <form.Field
          name="name"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>名称</FieldLabel>
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
      </FieldGroup>
      <form.Subscribe
        selector={(state) => state.isSubmitting}
        children={(isSubmitting) => (
          <LoadingButton type="submit" loading={isSubmitting} className="mt-4">
            应用名称
          </LoadingButton>
        )}
      />
    </form>
  )
}
