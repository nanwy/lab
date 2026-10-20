import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { useState } from 'react'
import { Button } from '@workspace/ui/components/button'
import {
  FieldGroup,
  FieldSet,
  FieldLegend,
  FieldError,
} from '@workspace/ui/components/field'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import {
  getPositions,
  initialPositionSchema,
  saveInitialPosition,
  type CurrentUser,
} from '../api/auth'
import { establishSession } from '../auth/session'
import { usePageSignal } from '../auth/use-page-signal'
import { useAccessFailure } from '../auth/access'

export function InitialPositionDialog({
  user,
  close,
}: {
  user: CurrentUser
  close: () => void
}) {
  const positions = useQuery({
    queryKey: ['account', 'positions'],
    queryFn: ({ signal }) => getPositions(signal),
    retry: false,
  })
  const [error, setError] = useState('')
  const pageSignal = usePageSignal()
  const accessFailure = useAccessFailure()
  const client = useQueryClient()
  const form = useForm({
    defaultValues: {
      ai_app: user.extend_info?.ai_app ?? '',
      position: user.extend_info?.position ?? [],
    },
    validators: { onSubmit: initialPositionSchema },
    onSubmit: async ({ value }) => {
      const signal = pageSignal()
      setError('')
      try {
        const updated = await saveInitialPosition(value, signal)
        if (signal.aborted) return
        establishSession(client, updated)
        await client.invalidateQueries({ queryKey: ['home'] })
        if (!signal.aborted) close()
      } catch (error) {
        if (!signal.aborted && !accessFailure(error))
          setError('岗位信息保存失败，请重试。')
      }
    },
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
          <DialogTitle>选择您的岗位</DialogTitle>
          <DialogDescription>
            平台将根据您选择的岗位进行资源推荐，保存后可以在个人中心修改。
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <FieldGroup className="gap-4">
            {positions.isPending ? (
              <p role="status">正在读取岗位…</p>
            ) : positions.isError ? (
              <div role="alert">
                岗位读取失败。
                <Button type="button" onClick={() => void positions.refetch()}>
                  重试岗位
                </Button>
              </div>
            ) : positions.data.length ? (
              <form.Field
                name="position"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <FieldSet data-invalid={isInvalid} className="gap-3">
                      <FieldLegend className="sr-only">您的岗位</FieldLegend>
                      <div className="flex flex-wrap gap-3">
                        {positions.data.map((p) => (
                          <Button
                            type="button"
                            key={p.id}
                            variant={
                              field.state.value.includes(p.id)
                                ? 'default'
                                : 'outline'
                            }
                            aria-pressed={field.state.value.includes(p.id)}
                            onClick={() => field.handleChange([p.id])}
                          >
                            {p.name}
                          </Button>
                        ))}
                      </div>
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </FieldSet>
                  )
                }}
              />
            ) : (
              <p>未开放岗位选择</p>
            )}
            {error ? (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            ) : null}
            <form.Subscribe selector={(s) => s.isSubmitting}>
              {(busy) => (
                <LoadingButton
                  type="submit"
                  loading={busy}
                  disabled={!positions.data}
                >
                  保存信息
                </LoadingButton>
              )}
            </form.Subscribe>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}
