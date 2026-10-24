import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { Button } from '@workspace/ui/components/button'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { Input } from '@workspace/ui/components/input'
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldError,
} from '@workspace/ui/components/field'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@workspace/ui/components/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@workspace/ui/components/alert-dialog'
import { toast } from '@workspace/ui/components/sonner'
import { ApiError } from '../api'
import { usePageSignal } from '../auth/use-page-signal'
import { noteNameSchema } from '../api/personal-notes'
export function reportNoteError(error: unknown, signal?: AbortSignal) {
  if (
    signal?.aborted ||
    (error instanceof ApiError && (error.handled || error.kind === 'cancelled'))
  )
    return
  toast.error(error instanceof Error ? error.message : '笔记操作失败')
}
export function NoteNameDialog({
  title,
  initial = '',
  save,
  close,
}: {
  title: string
  initial?: string
  save: (name: string, signal: AbortSignal) => Promise<unknown>
  close: () => void
}) {
  const signalForDialog = usePageSignal()
  const form = useForm({
    defaultValues: { name: initial },
    validators: { onSubmit: noteNameSchema },
    onSubmit: async ({ value }) => {
      const signal = signalForDialog()
      try {
        await save(value.name, signal)
        if (!signal.aborted) close()
      } catch (error) {
        reportNoteError(error, signal)
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>名称最多50个字符。</DialogDescription>
        </DialogHeader>
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
                      maxLength={50}
                      aria-invalid={isInvalid}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(submitting) => (
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={close}>
                    取消
                  </Button>
                  <LoadingButton type="submit" loading={submitting}>
                    保存名称
                  </LoadingButton>
                </div>
              )}
            </form.Subscribe>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}
export function NoteDeleteDialog({
  description,
  remove,
  close,
}: {
  description: string
  remove: (signal: AbortSignal) => Promise<unknown>
  close: () => void
}) {
  const signalForDialog = usePageSignal()
  const [busy, setBusy] = useState(false)
  async function confirm() {
    if (busy) return
    const signal = signalForDialog()
    setBusy(true)
    try {
      await remove(signal)
      if (!signal.aborted) close()
    } catch (error) {
      reportNoteError(error, signal)
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>取消</AlertDialogCancel>
          <LoadingButton
            variant="destructive"
            loading={busy}
            onClick={() => void confirm()}
          >
            确认删除
          </LoadingButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
