import { Field, FieldLabel, FieldError } from '@workspace/ui/components/field'
import { Input } from '@workspace/ui/components/input'
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@workspace/ui/components/combobox'
import type { BlueId } from '../api/blue-team'
export type FieldValue<T> = {
  name: string
  state: { value: T; meta: { errors: ({ message?: string } | undefined)[] } }
  handleBlur: () => void
  handleChange: (value: T) => void
}
export function ScriptInput<T extends string | number>({
  field,
  label,
  invalid,
  numeric = false,
  min,
  max,
  maxLength,
}: {
  field: FieldValue<T>
  label: string
  invalid: boolean
  numeric?: boolean
  min?: number
  max?: number
  maxLength?: number
}) {
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        aria-invalid={invalid}
        type={numeric ? 'number' : 'text'}
        min={min}
        max={max}
        maxLength={maxLength}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) =>
          field.handleChange(
            (numeric && event.target.value !== ''
              ? Number(event.target.value)
              : event.target.value) as T,
          )
        }
      />
      {invalid && <FieldError errors={field.state.meta.errors} />}
    </Field>
  )
}
export function ScriptSelect<T extends BlueId>({
  field,
  label,
  invalid,
  options,
  container,
}: {
  field: FieldValue<T>
  label: string
  invalid: boolean
  options: { id: BlueId; label: string }[]
  container: HTMLDivElement | null
}) {
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Combobox
        items={options}
        value={
          options.find(
            (item) => String(item.id) === String(field.state.value),
          ) ?? null
        }
        itemToStringLabel={(item) => item.label}
        onValueChange={(item) => field.handleChange((item?.id ?? '') as T)}
      >
        <ComboboxInput
          id={field.name}
          name={field.name}
          aria-invalid={invalid}
          onBlur={field.handleBlur}
        />
        <ComboboxContent container={container}>
          <ComboboxEmpty>暂无匹配选项</ComboboxEmpty>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item.id} value={item}>
                {item.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {invalid && <FieldError errors={field.state.meta.errors} />}
    </Field>
  )
}
