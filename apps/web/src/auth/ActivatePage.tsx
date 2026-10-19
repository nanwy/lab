import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  activateOffline,
  activateOnline,
  getActivationStatus,
  offlineActivationSchema,
  onlineActivationSchema,
} from '../api/activation'
import { captchaUrl } from '../api/auth'
import { appConfig } from '../config'
import { usePageSignal } from './use-page-signal'
import { useAccessFailure } from './access'

function Errors({ errors }: { errors: readonly unknown[] }) {
  return (
    <small className="text-destructive" role="alert">
      {errors
        .map((e) =>
          typeof e === 'string'
            ? e
            : e && typeof e === 'object' && 'message' in e
              ? String(e.message)
              : '',
        )
        .join('；')}
    </small>
  )
}

export function ActivatePage() {
  const status = useQuery({
    queryKey: ['platform', 'activation'],
    queryFn: ({ signal }) => getActivationStatus(signal),
    retry: false,
  })
  const [online, setOnline] = useState(true)
  const [notice, setNotice] = useState('')
  const [captcha, setCaptcha] = useState(Date.now)
  const [captchaFailed, setCaptchaFailed] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const pageSignal = usePageSignal()
  const accessFailure = useAccessFailure()
  const client = useQueryClient()
  const navigate = useNavigate()
  const form = useForm({
    defaultValues: {
      url: status.data?.url ?? '',
      activate_code: '',
      code: '',
      file: null as File | null,
    },
    validators: {
      onSubmit: z
        .object({
          url: z.string(),
          activate_code: z.string(),
          code: z.string(),
          file: z.instanceof(File).nullable(),
        })
        .superRefine((values, ctx) => {
          const parsed = (
            online ? onlineActivationSchema : offlineActivationSchema
          ).safeParse(values)
          if (!parsed.success)
            for (const issue of parsed.error.issues)
              ctx.addIssue({
                code: 'custom',
                path: issue.path,
                message: issue.message,
              })
        }),
    },
    onSubmit: async ({ value }) => {
      const signal = pageSignal()
      setNotice('')
      try {
        const result = online
          ? await activateOnline(value, signal)
          : await activateOffline(value.activate_code, value.file!, signal)
        if (signal.aborted) return
        if (result.status === 1) {
          client.clear()
          await navigate({ to: '/', replace: true })
        } else {
          setNotice('激活未成功，请检查授权信息后重试。')
          setCaptcha(Date.now())
        }
      } catch (error) {
        if (signal.aborted || accessFailure(error)) return
        setNotice('激活请求失败，请检查网络或授权信息后重试。')
        setCaptcha(Date.now())
      }
    },
  })

  return (
    <main className="min-h-screen bg-muted px-5 py-12 text-foreground">
      <section className="mx-auto max-w-2xl space-y-6 rounded-xl border bg-card p-6 sm:p-10">
        <header className="space-y-3">
          <p className="text-sm text-muted-foreground">平台授权</p>
          <h1 className="text-3xl font-semibold">系统激活</h1>
        </header>
        {appConfig.mockEnabled ? (
          <p role="note">本地模拟激活，不修改原平台授权。</p>
        ) : (
          <p role="note">真实授权变更：仅由获准的操作人员提交。</p>
        )}
        {status.isPending ? <p role="status">正在读取激活状态…</p> : null}
        {status.isError ? (
          <div role="alert">
            激活状态读取失败。
            <Button variant="link" onClick={() => void status.refetch()}>
              重试
            </Button>
          </div>
        ) : null}
        {status.data ? (
          <div className="space-y-2">
            <p>{status.data.status === 1 ? '系统已激活' : '系统尚未激活'}</p>
            {status.data.expire_time ? (
              <p>过期时间：{status.data.expire_time}</p>
            ) : null}
          </div>
        ) : null}
        <div className="flex gap-3" aria-label="激活方式">
          <Button
            variant={online ? 'default' : 'outline'}
            aria-pressed={online}
            onClick={() => {
              setOnline(true)
              setNotice('')
              form.setFieldValue('file', null)
            }}
          >
            在线激活
          </Button>
          <Button
            variant={online ? 'outline' : 'default'}
            aria-pressed={!online}
            onClick={() => {
              setOnline(false)
              setNotice('')
            }}
          >
            本地激活
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {online
            ? '请填写激活码，并确保设备与授权服务器之间网络通信正常。'
            : `当前机器码：${status.data?.device_id ?? ''}`}
        </p>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void form.handleSubmit()
          }}
        >
          {online ? (
            <form.Field name="url">
              {(field) => (
                <label className="grid gap-2">
                  <span>激活网址</span>
                  <Input
                    aria-label="激活网址"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={field.state.meta.errors.length > 0}
                  />
                  <Errors errors={field.state.meta.errors} />
                </label>
              )}
            </form.Field>
          ) : null}
          <form.Field name="activate_code">
            {(field) => (
              <label className="grid gap-2">
                <span>激活码</span>
                <Input
                  aria-label="激活码"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0}
                />
                <Errors errors={field.state.meta.errors} />
              </label>
            )}
          </form.Field>
          {online ? (
            <form.Field name="code">
              {(field) => (
                <div className="grid gap-2">
                  <label className="grid gap-2">
                    <span>验证码</span>
                    <Input
                      aria-label="验证码"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-28 p-0"
                    aria-label="刷新验证码"
                    onClick={() => {
                      setCaptchaFailed(false)
                      setCaptcha(Date.now())
                    }}
                  >
                    {captchaFailed ? (
                      '加载失败，重试'
                    ) : (
                      <img
                        src={captchaUrl(captcha)}
                        alt="验证码"
                        className="size-full"
                        onError={() => setCaptchaFailed(true)}
                      />
                    )}
                  </Button>
                  <Errors errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>
          ) : (
            <form.Field name="file">
              {(field) => (
                <div className="grid gap-2">
                  <label className="grid gap-2">
                    <span>License 文件</span>
                    <Input
                      ref={fileInput}
                      key={String(online)}
                      type="file"
                      onChange={(e) =>
                        field.handleChange(e.target.files?.[0] ?? null)
                      }
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                  </label>
                  {field.state.value ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        field.handleChange(null)
                        form.resetField('file')
                        if (fileInput.current) fileInput.current.value = ''
                      }}
                    >
                      移除文件
                    </Button>
                  ) : null}
                  <Errors errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>
          )}
          {notice ? (
            <p role="alert" className="text-destructive">
              {notice}
            </p>
          ) : null}
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(busy) => (
              <LoadingButton
                type="submit"
                loading={busy}
                disabled={!status.data}
              >
                激活
              </LoadingButton>
            )}
          </form.Subscribe>
        </form>
        <Link className="text-sm text-primary underline" to="/login">
          返回登录
        </Link>
      </section>
    </main>
  )
}
