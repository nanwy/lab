import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldError,
  FieldDescription,
  FieldSet,
  FieldLegend,
} from '@workspace/ui/components/field'
import { Alert, AlertDescription } from '@workspace/ui/components/alert'
import { Checkbox } from '@workspace/ui/components/checkbox'
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from '@workspace/ui/components/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import {
  avatarFileSchema,
  getPersonalStatistics,
  getPositions,
  profileFormSchema,
  profileValues,
  saveProfile,
  uploadAvatar,
  type CurrentUser,
} from '../api/auth'
import { currentUserQueryOptions, establishSession } from './session'
import { usePageSignal } from './use-page-signal'
import { useAccessFailure } from './access'
import { NoticesPanel } from '../activity/Notices'
import { CollectionsPanel } from '../activity/CollectionsPanel'

const tabs = {
  info: '个人信息',
  enshrine: '我的收藏',
  resource: '虚拟资源',
  message: '系统消息',
} as const
const metricLabels = {
  login_day: '登录天数',
  study_length: '学习时长',
  finished_course: '完成课程学习',
  finished_subject_scene: '完成场景实操',
  finished_assessment: '参加考核次数',
} as const

export function PersonalPage({ type }: { type: keyof typeof tabs }) {
  const session = useQuery(currentUserQueryOptions())
  const stats = useQuery({
    queryKey: ['account', 'personal-statistics'],
    queryFn: ({ signal }) => getPersonalStatistics(signal),
    retry: false,
  })
  if (!session.data) return null // 外层公共守卫负责恢复与权限错误。
  return (
    <section className="space-y-8">
      <header className="space-y-5">
        <h1 className="text-3xl font-semibold">个人中心</h1>
        <div className="flex flex-wrap items-center gap-5">
          <Avatar className="size-24">
            <AvatarImage
              src={session.data.logo || undefined}
              alt="用户头像"
              className="object-cover"
            />
            <AvatarFallback>头像</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-xl font-semibold">
              {session.data.username || '未设置用户名'}
            </p>
            {session.data.job_number ? (
              <p>工号：{session.data.job_number}</p>
            ) : null}
          </div>
        </div>
        {stats.isPending ? (
          <p role="status">正在读取个人统计…</p>
        ) : stats.isError ? (
          <div role="alert">
            个人统计读取失败。
            <Button variant="link" onClick={() => void stats.refetch()}>
              重试统计
            </Button>
          </div>
        ) : (
          <dl className="flex flex-wrap gap-x-9 gap-y-4">
            {(Object.keys(metricLabels) as (keyof typeof metricLabels)[]).map(
              (key) => (
                <div key={key}>
                  <dt className="text-sm text-muted-foreground">
                    {metricLabels[key]}
                  </dt>
                  <dd className="text-xl font-semibold">{stats.data[key]}</dd>
                </div>
              ),
            )}
          </dl>
        )}
      </header>
      <nav
        aria-label="个人中心页签"
        className="flex flex-wrap gap-5 border-b pb-4"
      >
        {Object.entries(tabs).map(([key, label]) => (
          <Link
            key={key}
            to="/basic/personal/$type"
            params={{ type: key }}
            aria-current={type === key ? 'page' : undefined}
            className={
              type === key
                ? 'font-semibold text-primary underline'
                : 'text-muted-foreground'
            }
          >
            {label}
          </Link>
        ))}
      </nav>
      {type === 'info' ? (
        <ProfileEditor key={session.data.id} user={session.data} />
      ) : type === 'message' ? (
        <NoticesPanel />
      ) : type === 'enshrine' ? (
        <CollectionsPanel />
      ) : (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">{tabs[type]}</h2>
          <p role="note">
            {type === 'resource'
              ? '虚拟资源业务随操作机相关切片实现。'
              : '完整收藏和消息管理由 S04 实现。'}
            此入口尚未提供对应业务操作。
          </p>
        </section>
      )}
    </section>
  )
}

function ProfileEditor({ user }: { user: CurrentUser }) {
  const positions = useQuery({
    queryKey: ['account', 'positions'],
    queryFn: ({ signal }) => getPositions(signal),
    retry: false,
  })
  const client = useQueryClient()
  const pageSignal = usePageSignal()
  const accessFailure = useAccessFailure()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const form = useForm({
    defaultValues: profileValues(user),
    validators: { onSubmit: profileFormSchema },
    onSubmit: async ({ value, formApi }) => {
      const signal = pageSignal()
      setError('')
      setNotice('')
      try {
        const saved = await saveProfile(value, user.extend_info, signal)
        if (signal.aborted) return
        establishSession(client, saved)
        formApi.reset(profileValues(saved))
        setNotice('基本信息已保存。')
      } catch (error) {
        if (!signal.aborted && !accessFailure(error))
          setError('基本信息保存失败，编辑内容已保留，请重试。')
      }
    },
  })
  async function changeAvatar(file: File) {
    setError('')
    setNotice('')
    const valid = avatarFileSchema.safeParse(file)
    if (!valid.success) {
      setError(valid.error.issues[0]?.message ?? '头像文件无效')
      return
    }
    const signal = pageSignal()
    setUploading(true)
    try {
      const saved = await uploadAvatar(file, signal)
      if (signal.aborted) return
      establishSession(client, saved)
      setNotice('头像已更新。')
    } catch (error) {
      if (!signal.aborted && !accessFailure(error))
        setError('头像上传失败，请重试。')
    } finally {
      if (!signal.aborted) setUploading(false)
    }
  }
  return (
    <section className="max-w-2xl space-y-5">
      <h2 className="text-xl font-semibold">个人信息</h2>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          form.handleSubmit()
        }}
      >
        <FieldGroup className="gap-4">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(saving) => (
              <FieldSet
                disabled={saving || uploading}
                className="grid gap-5 disabled:opacity-70"
              >
                <Field>
                  <FieldLabel htmlFor="profile-avatar">修改头像</FieldLabel>
                  <Input
                    id="profile-avatar"
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file) void changeAvatar(file)
                    }}
                  />
                  <FieldDescription>
                    只支持 JPG、PNG、JPEG，大小不超过5M，建议尺寸100×100。
                  </FieldDescription>
                </Field>
                {uploading ? <p role="status">正在上传头像…</p> : null}
                <Field>
                  <FieldLabel htmlFor="profile-username">用户名</FieldLabel>
                  <Input
                    id="profile-username"
                    readOnly
                    value={user.username ?? ''}
                  />
                </Field>
                <form.Field
                  name="realname"
                  children={(field) => {
                    const isInvalid =
                      field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>姓名</FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          maxLength={20}
                          aria-invalid={isInvalid}
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          onBlur={field.handleBlur}
                        />
                        {isInvalid && (
                          <FieldError errors={field.state.meta.errors} />
                        )}
                      </Field>
                    )
                  }}
                />
                <form.Field
                  name="position"
                  children={(field) => {
                    const isInvalid =
                      field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <FieldSet className="grid gap-2" data-invalid={isInvalid}>
                        <FieldLegend className="mb-2">
                          所属岗位（多选）
                        </FieldLegend>
                        {positions.isPending ? (
                          <p role="status">正在读取岗位…</p>
                        ) : positions.isError ? (
                          <div role="alert">
                            岗位读取失败。
                            <Button
                              type="button"
                              variant="link"
                              onClick={() => void positions.refetch()}
                            >
                              重试岗位
                            </Button>
                          </div>
                        ) : positions.data.length ? (
                          <div className="flex flex-wrap gap-4">
                            {positions.data.map((p) => (
                              <Field
                                key={p.id}
                                orientation="horizontal"
                                className="w-auto gap-2"
                              >
                                <Checkbox
                                  name={field.name}
                                  onBlur={field.handleBlur}
                                  aria-invalid={isInvalid}
                                  id={
                                    'profile-position-' +
                                    encodeURIComponent(p.id)
                                  }
                                  checked={field.state.value.includes(p.id)}
                                  onCheckedChange={(checked) =>
                                    field.handleChange(
                                      checked === true
                                        ? [...field.state.value, p.id]
                                        : field.state.value.filter(
                                            (id) => id !== p.id,
                                          ),
                                    )
                                  }
                                />
                                <FieldLabel
                                  htmlFor={
                                    'profile-position-' +
                                    encodeURIComponent(p.id)
                                  }
                                >
                                  {p.name}
                                </FieldLabel>
                              </Field>
                            ))}
                          </div>
                        ) : (
                          <p>未开放岗位选择</p>
                        )}
                        {isInvalid && (
                          <FieldError errors={field.state.meta.errors} />
                        )}
                      </FieldSet>
                    )
                  }}
                />
                <form.Field
                  name="unit"
                  children={(field) => {
                    const isInvalid =
                      field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>所属单位</FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          maxLength={32}
                          aria-invalid={isInvalid}
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          onBlur={field.handleBlur}
                        />
                        {isInvalid && (
                          <FieldError errors={field.state.meta.errors} />
                        )}
                      </Field>
                    )
                  }}
                />
                <form.Field
                  name="phone"
                  children={(field) => {
                    const isInvalid =
                      field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>手机号</FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          maxLength={11}
                          type="tel"
                          aria-invalid={isInvalid}
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          onBlur={field.handleBlur}
                        />
                        {isInvalid && (
                          <FieldError errors={field.state.meta.errors} />
                        )}
                      </Field>
                    )
                  }}
                />
                <form.Field
                  name="email"
                  children={(field) => {
                    const isInvalid =
                      field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>邮箱</FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          maxLength={100}
                          type="text"
                          inputMode="email"
                          aria-invalid={isInvalid}
                          value={field.state.value}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                          onBlur={field.handleBlur}
                        />
                        {isInvalid && (
                          <FieldError errors={field.state.meta.errors} />
                        )}
                      </Field>
                    )
                  }}
                />
              </FieldSet>
            )}
          </form.Subscribe>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {notice ? <p role="status">{notice}</p> : null}
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(busy) => (
              <LoadingButton type="submit" loading={busy} disabled={uploading}>
                保存基本信息
              </LoadingButton>
            )}
          </form.Subscribe>
        </FieldGroup>
      </form>
      <form.Subscribe selector={(s) => s.isDirty}>
        {(dirty) => <UnsavedProfileGuard dirty={dirty} />}
      </form.Subscribe>
    </section>
  )
}

function UnsavedProfileGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  })
  return (
    <Dialog
      open={blocker.status === 'blocked'}
      onOpenChange={(open) => {
        if (!open) blocker.reset?.()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>放弃未保存的资料？</DialogTitle>
          <DialogDescription>继续离开会丢失本次编辑内容。</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={blocker.reset}>
            继续编辑
          </Button>
          <Button onClick={blocker.proceed}>放弃并离开</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
