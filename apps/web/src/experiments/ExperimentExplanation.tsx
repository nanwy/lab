import { useState } from 'react'
import { useForm, useStore } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { z } from 'zod'
import { Button } from '@workspace/ui/components/button'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@workspace/ui/components/field'
import { toast } from '@workspace/ui/components/sonner'
import { ApiError } from '../api'
import {
  experimentKeys,
  saveExperimentOverview,
  type ExperimentDetail,
} from '../api/experiments'
import { usePageSignal } from '../auth/use-page-signal'
import {
  RichContentEditor,
  RichContentReadOnly,
} from '../content/RichContentEditor'
import { validateImageSources } from '../content/html'

const explanationSchema = z.object({ overview: z.string() })

export function ExperimentExplanationSession({
  experiment,
}: {
  experiment: ExperimentDetail
}) {
  const [editing, setEditing] = useState(false)
  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">场景说明</h2>
        {!editing && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            编辑说明
          </Button>
        )}
      </header>
      {editing ? (
        <ExplanationEditor
          experiment={experiment}
          close={() => setEditing(false)}
        />
      ) : experiment.overview ? (
        <RichContentReadOnly value={experiment.overview} />
      ) : (
        <p className="text-muted-foreground">暂无场景说明</p>
      )}
    </section>
  )
}

function ExplanationEditor({
  experiment,
  close,
}: {
  experiment: ExperimentDetail
  close: () => void
}) {
  const client = useQueryClient()
  const pageSignal = usePageSignal()
  const [uploading, setUploading] = useState(false)
  // 编辑会话持有起始正文；后台刷新实验详情不会重置尚未保存的输入。
  const [baseline] = useState(experiment.overview ?? '')
  const form = useForm({
    defaultValues: { overview: baseline },
    validators: { onSubmit: explanationSchema },
    onSubmit: async ({ value }) => {
      if (uploading) return
      validateImageSources(value.overview)
      const signal = pageSignal()
      await saveExperimentOverview(experiment.id, value.overview, signal)
      if (signal.aborted) return
      await client.invalidateQueries(
        { queryKey: experimentKeys.detail(experiment.id) },
        { throwOnError: true },
      )
      if (!signal.aborted) close()
    },
  })
  const dirty = useStore(
    form.store,
    (state) => state.values.overview !== baseline,
  )
  const busy = useStore(form.store, (state) => state.isSubmitting)
  const blocker = useBlocker({
    shouldBlockFn: () => dirty || busy || uploading,
    enableBeforeUnload: dirty || busy || uploading,
    withResolver: true,
  })
  const save = () =>
    void form.handleSubmit().catch((error: unknown) => {
      if (!(
        error instanceof ApiError &&
        (error.handled || error.kind === 'cancelled')
      ))
        toast.error(
          error instanceof Error ? error.message : '说明保存失败，请重试',
        )
    })
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <FieldGroup>
        <form.Field
          name="overview"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>说明正文</FieldLabel>
                <div inert={busy}>
                  <RichContentEditor
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    aria-invalid={isInvalid}
                    value={field.state.value}
                    onChange={field.handleChange}
                    scopeKey={`explanation:${experiment.id}`}
                    upload={{ mode: 'scene' }}
                    onUploadingChange={setUploading}
                  />
                </div>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
      </FieldGroup>
      <form.Subscribe
        selector={(state) => state.isSubmitting}
        children={(isSubmitting) => (
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={close}
            >
              取消
            </Button>
            <LoadingButton
              type="submit"
              loading={isSubmitting}
              disabled={uploading}
            >
              确定
            </LoadingButton>
          </div>
        )}
      />
      {blocker.status === 'blocked' && (
        <div className="dialog-backdrop">
          <section
            className="dialog"
            role="alertdialog"
            aria-label="放弃未保存的说明？"
          >
            <h2>放弃未保存的说明？</h2>
            <div className="dialog-actions">
              <Button type="button" variant="outline" onClick={blocker.reset}>
                留在这里
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={blocker.proceed}
              >
                继续离开
              </Button>
            </div>
          </section>
        </div>
      )}
    </form>
  )
}
