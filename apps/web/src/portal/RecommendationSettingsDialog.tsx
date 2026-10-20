import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@workspace/ui/components/sonner'
import { ApiError } from '../api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldError,
} from '@workspace/ui/components/field'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  getRecommendationSettings,
  recommendationLabels,
  recommendationSettingsSchema,
  saveRecommendationSettings,
  type RecommendationSettings,
} from '../api/portal'
import { usePageSignal } from '../auth/use-page-signal'

export function RecommendationSettingsDialog({ close }: { close: () => void }) {
  const settings = useQuery({
    queryKey: ['home', 'recommendation-settings'],
    queryFn: ({ signal }) => getRecommendationSettings(signal),
    retry: false,
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>推荐设置</DialogTitle>
          <DialogDescription>
            调整六项推荐权重，范围为 0 到 10。
          </DialogDescription>
        </DialogHeader>
        {settings.isPending ? (
          <p role="status">正在读取设置…</p>
        ) : settings.isError ? (
          <div role="alert">
            推荐设置读取失败。
            <Button onClick={() => void settings.refetch()}>重试</Button>
          </div>
        ) : (
          <SettingsForm values={settings.data} close={close} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function SettingsForm({
  values,
  close,
}: {
  values: RecommendationSettings
  close: () => void
}) {
  const signalForPage = usePageSignal()
  const client = useQueryClient()
  const form = useForm({
    defaultValues: values,
    validators: { onSubmit: recommendationSettingsSchema },
    onSubmit: async ({ value }) => {
      const signal = signalForPage()
      await saveRecommendationSettings(value, signal)
      if (signal.aborted) return
      await Promise.all([
        client.invalidateQueries({ queryKey: ['home', 'recommendations'] }),
        client.invalidateQueries({
          queryKey: ['home', 'recommendation-settings'],
        }),
      ])
      if (!signal.aborted) close()
    },
  })
  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit().catch((error: unknown) => {
          if (!(error instanceof ApiError) || !error.handled)
            toast.error(
              error instanceof ApiError ? error.message : '提交失败，请重试',
            )
        })
      }}
    >
      <FieldGroup className="gap-4">
        {(
          Object.keys(recommendationLabels) as (keyof RecommendationSettings)[]
        ).map((name) => (
          <form.Field
            key={name}
            name={name}
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={isInvalid}>
                  <div className="flex items-center gap-2">
                    <FieldLabel htmlFor={field.name}>
                      {recommendationLabels[name]}
                    </FieldLabel>
                    <span>{field.state.value}</span>
                  </div>
                  <Input
                    id={field.name}
                    name={field.name}
                    aria-invalid={isInvalid}
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                    onBlur={field.handleBlur}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          />
        ))}
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(busy) => (
            <LoadingButton type="submit" loading={busy}>
              保存设置
            </LoadingButton>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  )
}
