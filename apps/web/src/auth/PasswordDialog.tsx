import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldError,
} from '@workspace/ui/components/field'
import { Alert, AlertDescription } from '@workspace/ui/components/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { ApiError } from '../api'
import {
  changePassword,
  isSessionExpired,
  logout,
  passwordChangeSchema,
} from '../api/auth'
import { clearSession } from './session'
import { usePageSignal } from './use-page-signal'
import { useAccessFailure } from './access'

export function PasswordDialog({ close }: { close: () => void }) {
  const [changed, setChanged] = useState(false)
  const [error, setError] = useState('')
  const client = useQueryClient()
  const navigate = useNavigate()
  const pageSignal = usePageSignal()
  const accessFailure = useAccessFailure()
  async function finishSignOut(signal: AbortSignal) {
    setError('')
    try {
      await logout(signal)
    } catch (error) {
      if (signal.aborted) return
      // 改密可能已使服务端会话失效，此时无需重复退出。
      if (!isSessionExpired(error)) {
        if (!accessFailure(error))
          setError('密码已修改，但退出失败。请重试退出，无需再次修改密码。')
        return
      }
    }
    if (signal.aborted) return
    clearSession(client)
    await navigate({
      to: '/login',
      search: { reason: 'password-changed' },
      replace: true,
    })
  }
  const form = useForm({
    defaultValues: { cipher: '', password: '', confirm_password: '' },
    validators: { onSubmit: passwordChangeSchema },
    onSubmit: async ({ value, formApi }) => {
      const signal = pageSignal()
      setError('')
      try {
        await changePassword(value, signal)
        if (signal.aborted) return
        setChanged(true)
        await finishSignOut(signal)
        if (!signal.aborted) formApi.reset()
      } catch (error) {
        if (signal.aborted || accessFailure(error)) return
        if (error instanceof ApiError && error.fieldErrors) {
          for (const name of [
            'cipher',
            'password',
            'confirm_password',
          ] as const) {
            const message = error.fieldErrors[name]
            if (message)
              formApi.setFieldMeta(name, (meta) => ({
                ...meta,
                errorMap: { ...meta.errorMap, onServer: { message } },
              }))
          }
        } else setError('密码修改失败，请检查输入或稍后重试。')
      }
    },
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !changed) close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>修改密码</DialogTitle>
          <DialogDescription>
            修改成功后退出当前会话，请使用新密码重新登录。
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!changed) form.handleSubmit()
          }}
        >
          <FieldGroup className="gap-4">
            <form.Field
              name="cipher"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>原密码</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      aria-invalid={isInvalid}
                      type="password"
                      disabled={changed}
                      autoComplete="current-password"
                      maxLength={100}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        field.handleChange(e.target.value)
                        form.setFieldMeta('cipher', (meta) => ({
                          ...meta,
                          errorMap: { ...meta.errorMap, onServer: undefined },
                        }))
                      }}
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />
            <form.Field
              name="password"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>新密码</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      aria-invalid={isInvalid}
                      type="password"
                      disabled={changed}
                      autoComplete="new-password"
                      maxLength={100}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        field.handleChange(e.target.value)
                        form.setFieldMeta('password', (meta) => ({
                          ...meta,
                          errorMap: { ...meta.errorMap, onServer: undefined },
                        }))
                      }}
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />
            <form.Field
              name="confirm_password"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>确认密码</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      aria-invalid={isInvalid}
                      type="password"
                      disabled={changed}
                      autoComplete="new-password"
                      maxLength={100}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        field.handleChange(e.target.value)
                        form.setFieldMeta('confirm_password', (meta) => ({
                          ...meta,
                          errorMap: { ...meta.errorMap, onServer: undefined },
                        }))
                      }}
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />
            {changed ? (
              <p role="status">密码已修改，请退出后使用新密码登录。</p>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={close}
                disabled={changed}
              >
                取消
              </Button>
              <form.Subscribe selector={(s) => s.isSubmitting}>
                {(busy) => (
                  <LoadingButton
                    type={changed ? 'button' : 'submit'}
                    loading={busy}
                    onClick={
                      changed ? () => finishSignOut(pageSignal()) : undefined
                    }
                  >
                    {changed ? '重试退出' : '确定修改'}
                  </LoadingButton>
                )}
              </form.Subscribe>
            </div>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}
