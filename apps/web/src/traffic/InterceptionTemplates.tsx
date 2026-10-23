import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { Button } from '@workspace/ui/components/button'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { Input } from '@workspace/ui/components/input'
import {
  Field,
  FieldGroup,
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
import { toast } from '@workspace/ui/components/sonner'
import {
  deleteInterceptionTemplate,
  draftFromConfig,
  emptyInterception,
  getInterceptionTemplates,
  importInterceptionTemplates,
  interceptionExportHref,
  saveInterceptionTemplate,
  type InterceptionDraft,
  type InterceptionTemplate,
} from '../api/traffic-interception'
import { usePageSignal } from '../auth/use-page-signal'
import { captureError, CaptureConfirmation } from './CaptureRecords'
import { InterceptionFields } from './InterceptionFields'

export function InterceptionTemplates({
  protocols,
  running,
  apply,
}: {
  protocols: string[]
  running: boolean
  apply: (draft: InterceptionDraft) => void
}) {
  const templates = useQuery({
    queryKey: ['interception-templates'],
    queryFn: ({ signal }) => getInterceptionTemplates(signal),
    retry: false,
  })
  const [selection, setSelection] = useState<
    InterceptionTemplate | null | undefined
  >(undefined)
  const [deleting, setDeleting] = useState<InterceptionTemplate | null>(null)
  const [importing, setImporting] = useState(false)
  const signal = usePageSignal()
  const selected = selection === undefined ? templates.data?.[0] : selection
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button onClick={() => setImporting(true)}>导入模板</Button>
        <Button asChild disabled={!templates.data?.length}>
          <a
            href={interceptionExportHref()}
            download
            aria-disabled={!templates.data?.length}
          >
            导出模板
          </a>
        </Button>
      </div>
      {templates.isPending ? (
        <p role="status">正在加载拦截模板…</p>
      ) : templates.isError ? (
        <p role="alert">{templates.error.message}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <aside className="space-y-2" aria-label="拦截模板列表">
            {!templates.data.length && <p>暂无模板</p>}
            {templates.data.map((template) => (
              <div key={template.id} className="flex gap-1">
                <Button
                  variant={selected?.id === template.id ? 'default' : 'outline'}
                  onClick={() => setSelection(template)}
                >
                  {template.name}
                </Button>
                {!template.is_built_in && (
                  <Button
                    variant="ghost"
                    aria-label={`删除模板 ${template.name}`}
                    onClick={() => setDeleting(template)}
                  >
                    删除
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" onClick={() => setSelection(null)}>
              新建模板
            </Button>
          </aside>
          <InterceptionFields
            key={
              selected ? `${selected.id}:${JSON.stringify(selected)}` : 'new'
            }
            draft={selected ? draftFromConfig(selected) : emptyInterception}
            name={selected?.name}
            needName={!selected?.id}
            locked={!!selected?.is_built_in}
            hideSubmit={!!selected?.is_built_in}
            protocols={protocols}
            submitLabel="保存模板"
            submit={async (value) => {
              try {
                const saved = await saveInterceptionTemplate(
                  value,
                  value.name,
                  selected ?? undefined,
                  signal(),
                )
                if (!signal().aborted) {
                  setSelection(saved)
                  await templates.refetch()
                  toast.success(selected ? '编辑成功' : '添加成功')
                }
              } catch (error) {
                captureError(error)
              }
            }}
            footer={(value) =>
              selected ? (
                <Button
                  type="button"
                  disabled={running}
                  onClick={() => {
                    apply(value)
                    toast.success('应用成功')
                  }}
                >
                  应用模板
                </Button>
              ) : null
            }
          />
        </div>
      )}
      {deleting && (
        <CaptureConfirmation
          title="确认删除拦截模板？"
          close={() => setDeleting(null)}
          confirm={async () => {
            await deleteInterceptionTemplate(deleting.id, signal())
            if (!signal().aborted) {
              if (selected?.id === deleting.id) setSelection(undefined)
              setDeleting(null)
              await templates.refetch()
              toast.success('删除成功')
            }
          }}
        />
      )}
      {importing && (
        <ImportTemplates
          close={() => setImporting(false)}
          done={() => templates.refetch()}
        />
      )}
    </div>
  )
}
function ImportTemplates({
  close,
  done,
}: {
  close: () => void
  done: () => Promise<unknown>
}) {
  const [file, setFile] = useState<File | undefined>()
  const signal = usePageSignal()
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>导入拦截模板</DialogTitle>
          <DialogDescription>上传模板文件</DialogDescription>
        </DialogHeader>
        <Input
          type="file"
          aria-label="上传文件"
          onChange={(event) => setFile(event.target.files?.[0])}
        />
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={close}>
            取消
          </Button>
          <LoadingButton
            onError={captureError}
            onClick={async () => {
              if (!file) return
              await importInterceptionTemplates(file, signal())
              if (!signal().aborted) {
                await done()
                close()
                toast.success('导入成功')
              }
            }}
          >
            确认
          </LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
export function SaveInterceptionAs({
  draft,
  close,
}: {
  draft: InterceptionDraft
  close: () => void
}) {
  const signal = usePageSignal()
  const form = useForm({
    defaultValues: { name: '' },
    validators: {
      onSubmit: z.object({ name: z.string().min(1, '请输入模板名称') }),
    },
    onSubmit: async ({ value }) => {
      try {
        await saveInterceptionTemplate(
          draft,
          value.name,
          undefined,
          signal(),
          true,
        )
        if (!signal().aborted) {
          toast.success('添加成功')
          close()
        }
      } catch (error) {
        captureError(error)
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
          <DialogTitle>另存为模板</DialogTitle>
          <DialogDescription>保存当前拦截策略及代码</DialogDescription>
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
                    <FieldLabel htmlFor={field.name}>模板名称</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      aria-invalid={isInvalid}
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />
          </FieldGroup>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" onClick={close}>
              取消
            </Button>
            <form.Subscribe
              selector={(state) => state.isSubmitting}
              children={(isSubmitting) => (
                <LoadingButton type="submit" loading={isSubmitting}>
                  确认
                </LoadingButton>
              )}
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
