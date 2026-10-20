import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

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
  captchaUrl,
  getCurrentUser,
  getLoginBackground,
  login,
  loginCredentialsSchema,
  isSessionExpired,
} from '../api/auth'
import { ApiError } from '../api'
import { appConfig } from '../config'
import { currentUserQueryOptions, establishSession } from './session'
import { usePageSignal } from './use-page-signal'
import { useAccessFailure } from './access'

export type LoginReason = 'expired' | 'signed-out' | 'password-changed'
export function LoginPage({ reason }: { reason?: LoginReason }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const pageSignal = usePageSignal()
  const handleAccessFailure = useAccessFailure()
  const background = useQuery({
    queryKey: ['platform', 'login-background'],
    queryFn: ({ signal }) => getLoginBackground(signal),
    staleTime: 30_000,
    retry: false,
  })
  const session = useQuery({
    ...currentUserQueryOptions(),
    enabled: reason === undefined,
  })
  const [captchaVersion, setCaptchaVersion] = useState(() => Date.now())
  const [captchaFailed, setCaptchaFailed] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (reason === undefined && session.data)
      void navigate({ to: '/basic/home', replace: true })
  }, [navigate, session.data, reason])

  const form = useForm({
    defaultValues: { username: '', password: '', code: '' },
    validators: { onSubmit: loginCredentialsSchema },
    onSubmit: async ({ value, formApi }) => {
      const signal = pageSignal()
      setSubmitError('')
      try {
        await login(value, signal)
        const user = await getCurrentUser(signal)
        if (signal.aborted) return
        establishSession(queryClient, user)
        await navigate({ to: '/basic/home', replace: true })
      } catch (error) {
        if (signal.aborted || handleAccessFailure(error)) return
        setCaptchaFailed(false)
        setCaptchaVersion(Date.now())
        if (error instanceof ApiError) {
          for (const field of ['username', 'password', 'code'] as const) {
            const message = error.fieldErrors?.[field]
            if (message) {
              formApi.setFieldMeta(field, (meta) => ({
                ...meta,
                errorMap: { ...meta.errorMap, onServer: { message } },
              }))
            }
          }
          setSubmitError(
            error.kind === 'network'
              ? '网络连接失败，请检查后重试'
              : error.kind === 'invalid-response'
                ? error.message
                : error.kind === 'timeout'
                  ? '请求超时，请重试'
                  : error.status !== undefined && error.status >= 500
                    ? '服务暂时不可用，请稍后重试'
                    : error.fieldErrors
                      ? ''
                      : '用户名、密码或验证码错误',
          )
        } else {
          setSubmitError('登录失败，请重试')
        }
      }
    },
  })

  function refreshCaptcha() {
    setCaptchaFailed(false)
    setCaptchaVersion(Date.now())
  }

  return (
    <main
      className="grid min-h-screen place-items-center bg-muted bg-cover bg-center text-foreground min-[701px]:p-8"
      style={
        background.data?.front_background
          ? {
              backgroundImage: `url(${JSON.stringify(background.data.front_background)})`,
            }
          : undefined
      }
    >
      <section
        className="grid min-h-screen w-full grid-cols-1 overflow-hidden bg-card text-card-foreground min-[701px]:min-h-[31.25rem] min-[701px]:max-w-[62.5rem] min-[701px]:grid-cols-[1.15fr_0.85fr] min-[701px]:rounded-xl min-[701px]:border min-[701px]:shadow-xl"
        aria-labelledby="login-title"
      >
        <div className="bg-linear-to-br from-primary to-primary/80 px-6 py-8 text-primary-foreground min-[701px]:px-20 min-[701px]:py-18">
          <p className="mb-4 text-[clamp(2rem,5vw,3.25rem)] font-extrabold tracking-widest">
            WELCOME
          </p>
          <h1 className="max-w-96 text-[clamp(1.5rem,3vw,2.25rem)] leading-snug font-bold">
            网络攻防训练靶场平台
          </h1>
          <span className="mt-3 block text-lg">学员端</span>
        </div>
        <div className="px-6 py-8 min-[701px]:px-12 min-[701px]:py-14">
          <h2
            id="login-title"
            className="mb-7 text-center text-2xl font-semibold text-primary"
          >
            平台登录
          </h2>
          {background.isError ? (
            <p
              className="mb-4 text-center text-sm text-destructive"
              role="alert"
            >
              平台配置读取失败。
              <Button
                type="button"
                variant="link"
                onClick={() => void background.refetch()}
              >
                重试配置
              </Button>
            </p>
          ) : null}
          {appConfig.mockEnabled ? (
            <p className="mb-4 text-center text-sm text-muted-foreground">
              本地模拟：learner / xueyuan123；验证码 2468
            </p>
          ) : null}
          {reason === 'expired' ? (
            <p
              className="mb-4 text-center text-sm text-muted-foreground"
              role="status"
            >
              会话已失效，请重新登录。
            </p>
          ) : null}
          {reason === 'signed-out' ? (
            <p
              className="mb-4 text-center text-sm text-muted-foreground"
              role="status"
            >
              已安全退出。
            </p>
          ) : null}
          {reason === 'password-changed' ? (
            <p
              role="status"
              className="mb-4 text-center text-sm text-muted-foreground"
            >
              密码修改成功，请使用新密码重新登录。
            </p>
          ) : null}
          {session.isFetching ? (
            <p
              className="mb-4 text-center text-sm text-muted-foreground"
              role="status"
            >
              正在检查会话…
            </p>
          ) : null}
          {session.isError && !isSessionExpired(session.error) ? (
            <p
              className="mb-4 text-center text-sm text-destructive"
              role="alert"
            >
              无法检查已有会话，仍可尝试登录。
            </p>
          ) : null}
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              form.handleSubmit()
            }}
          >
            <FieldGroup className="gap-4">
              <form.Field
                name="username"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>用户名</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        aria-invalid={isInvalid}
                        autoComplete="username"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onFocus={() => {
                          form.setFieldMeta('username', (meta) => ({
                            ...meta,
                            errorMap: { ...meta.errorMap, onServer: undefined },
                          }))
                        }}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
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
                      <FieldLabel htmlFor={field.name}>密码</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        aria-invalid={isInvalid}
                        autoComplete="current-password"
                        type="password"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onFocus={() => {
                          form.setFieldMeta('password', (meta) => ({
                            ...meta,
                            errorMap: { ...meta.errorMap, onServer: undefined },
                          }))
                        }}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                      />
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  )
                }}
              />
              <form.Field
                name="code"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>验证码</FieldLabel>
                      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem]">
                        <Input
                          className="relative rounded-r-none focus-visible:z-10"
                          id={field.name}
                          name={field.name}
                          aria-invalid={isInvalid}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onFocus={() => {
                            form.setFieldMeta('code', (meta) => ({
                              ...meta,
                              errorMap: {
                                ...meta.errorMap,
                                onServer: undefined,
                              },
                            }))
                          }}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="overflow-hidden rounded-l-none border-l-0 p-0"
                          aria-label="刷新验证码"
                          onClick={refreshCaptcha}
                        >
                          {captchaFailed ? (
                            <span className="p-1 text-xs leading-tight whitespace-normal">
                              加载失败，点击重试
                            </span>
                          ) : (
                            <img
                              className="size-full object-cover"
                              src={captchaUrl(captchaVersion)}
                              alt="验证码"
                              onError={() => setCaptchaFailed(true)}
                            />
                          )}
                        </Button>
                      </div>
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  )
                }}
              />
              {submitError ? (
                <p className="text-sm text-destructive" role="alert">
                  {submitError}
                </p>
              ) : null}
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(submitting) => (
                  <LoadingButton type="submit" loading={submitting}>
                    登录
                  </LoadingButton>
                )}
              </form.Subscribe>
            </FieldGroup>
          </form>
        </div>
      </section>
    </main>
  )
}
