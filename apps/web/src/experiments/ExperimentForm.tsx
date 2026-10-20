import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@workspace/ui/components/button'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { Input } from '@workspace/ui/components/input'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from '@workspace/ui/components/field'
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxEmpty,
} from '@workspace/ui/components/combobox'
import {
  experimentInfoSchema,
  experimentKeys,
  getExperimentTags,
  saveExperiment,
  type Experiment,
  type ExperimentDetail,
} from '../api/experiments'
import { useAccessFailure } from '../auth/access'
import { usePageSignal } from '../auth/use-page-signal'

export function ExperimentForm({
  experiment,
  detail,
  saved,
  cancel,
}: {
  experiment?: Pick<Experiment, 'id' | 'name' | 'desc'>
  detail?: ExperimentDetail
  saved: () => Promise<void>
  cancel: () => void
}) {
  const [error, setError] = useState('')
  const client = useQueryClient()
  const signalForPage = usePageSignal()
  const accessFailure = useAccessFailure()
  const tags = useQuery({
    queryKey: ['experiment-tags'],
    queryFn: ({ signal }) => getExperimentTags(signal),
    enabled: !!detail,
    retry: false,
    staleTime: 30_000,
  })
  const form = useForm({
    defaultValues: {
      name: experiment?.name ?? '',
      desc: experiment?.desc ?? '',
      tag: detail?.tags.map((tag) => tag.name) ?? ([] as string[]),
    },
    validators: { onSubmit: experimentInfoSchema },
    onSubmit: async ({ value }) => {
      setError('')
      const signal = signalForPage()
      const values = experimentInfoSchema.parse(value)
      try {
        await saveExperiment(
          detail
            ? {
                ...values,
                release_type: detail.release_type,
                max_duration:
                  detail.release_type === 2 ? 2 : detail.max_duration,
                category: detail.tags_category,
              }
            : { name: values.name, desc: values.desc },
          experiment?.id,
          signal,
        )
        if (signal.aborted) return
        await client.invalidateQueries({ queryKey: experimentKeys.all })
        if (!signal.aborted) await saved()
      } catch (failure) {
        if (signal.aborted || accessFailure(failure)) return
        setError('保存失败，输入内容已保留，请重试。')
      }
    },
  })
  return (
    <form
      className="space-y-5"
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
                <FieldLabel htmlFor={field.name}>实验名称</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  aria-invalid={isInvalid}
                  maxLength={50}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    field.handleChange(event.target.value)
                  }}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
        <form.Field
          name="desc"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>实验概述</FieldLabel>
                <Textarea
                  id={field.name}
                  name={field.name}
                  aria-invalid={isInvalid}
                  maxLength={200}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    field.handleChange(event.target.value)
                  }}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
        {detail ? (
          <form.Field
            name="tag"
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>场景标签</FieldLabel>
                  <Combobox
                    multiple
                    items={tags.data?.map((tag) => tag.name) ?? []}
                    value={field.state.value}
                    onValueChange={(value) => {
                      field.handleChange(value)
                    }}
                  >
                    <ComboboxInput
                      id={field.name}
                      name={field.name}
                      aria-invalid={isInvalid}
                      onBlur={field.handleBlur}
                      disabled={tags.isPending || tags.isError}
                    />
                    <ComboboxContent>
                      <ComboboxEmpty>暂无匹配标签</ComboboxEmpty>
                      <ComboboxList>
                        {(tag: string) => (
                          <ComboboxItem key={tag} value={tag}>
                            {tag}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                  <p className="text-sm text-muted-foreground">
                    {field.state.value.join('、') || '未选择标签'}（最多五个）
                  </p>
                  {tags.isError ? (
                    <p role="alert">
                      标签加载失败。
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => void tags.refetch()}
                      >
                        重试标签
                      </Button>
                    </p>
                  ) : null}
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          />
        ) : null}
      </FieldGroup>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <form.Subscribe
        selector={(state) => state.isSubmitting}
        children={(isSubmitting) => (
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={cancel}
            >
              取消
            </Button>
            <LoadingButton type="submit" loading={isSubmitting}>
              保存
            </LoadingButton>
          </div>
        )}
      />
    </form>
  )
}
