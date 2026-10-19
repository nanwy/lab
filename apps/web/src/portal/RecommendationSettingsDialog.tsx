import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  getRecommendationSettings,
  recommendationLabels,
  recommendationSettingsSchema,
  saveRecommendationSettings,
  type RecommendationSettings,
} from '../api/portal'
import { usePageSignal } from '../auth/use-page-signal'
import { useAccessFailure } from '../auth/access'

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
  const [error, setError] = useState('')
  const signalForPage = usePageSignal()
  const accessFailure = useAccessFailure()
  const client = useQueryClient()
  const form = useForm({
    defaultValues: values,
    validators: { onSubmit: recommendationSettingsSchema },
    onSubmit: async ({ value }) => {
      const signal = signalForPage()
      setError('')
      try {
        await saveRecommendationSettings(value, signal)
        if (signal.aborted) return
        await Promise.all([
          client.invalidateQueries({ queryKey: ['home', 'recommendations'] }),
          client.invalidateQueries({
            queryKey: ['home', 'recommendation-settings'],
          }),
        ])
        if (!signal.aborted) close()
      } catch (error) {
        if (!signal.aborted && !accessFailure(error))
          setError('推荐设置保存失败，请重试。')
      }
    },
  })
  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void form.handleSubmit()
      }}
    >
      {(
        Object.keys(recommendationLabels) as (keyof RecommendationSettings)[]
      ).map((name) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <label className="grid gap-2">
              <span>
                {recommendationLabels[name]}：{field.state.value}
              </span>
              <Input
                type="range"
                min={0}
                max={10}
                step={1}
                aria-label={recommendationLabels[name]}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                onBlur={field.handleBlur}
              />
              <small role="alert" className="text-destructive">
                {field.state.meta.errors.map((e) => e?.message).join('；')}
              </small>
            </label>
          )}
        </form.Field>
      ))}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(busy) => (
          <LoadingButton type="submit" loading={busy}>
            保存设置
          </LoadingButton>
        )}
      </form.Subscribe>
    </form>
  )
}
