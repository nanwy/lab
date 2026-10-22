import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { Input } from '@workspace/ui/components/input'
import { Textarea } from '@workspace/ui/components/textarea'
import { Button } from '@workspace/ui/components/button'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  Field,
  FieldLabel,
  FieldError,
  FieldGroup,
} from '@workspace/ui/components/field'
import type { DirectoryEntry } from './session-transfers'

export function ClipboardForm({
  text,
  send,
}: {
  text: string
  send: (text: string) => void
}) {
  const form = useForm({
    defaultValues: { clipboard: text },
    validators: { onSubmit: z.object({ clipboard: z.string() }) },
    onSubmit: ({ value }) => send(value.clipboard),
  })
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.Field
          name="clipboard"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>剪贴板内容</FieldLabel>
                <Textarea
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                  rows={10}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
        <form.Subscribe
          selector={(state) => state.isSubmitting}
          children={(isSubmitting) => (
            <LoadingButton type="submit" loading={isSubmitting}>
              发送到远端
            </LoadingButton>
          )}
        />
      </FieldGroup>
    </form>
  )
}
export function DesktopFiles({
  path,
  entries,
  uploading,
  browse,
  upload,
  report,
}: {
  path: string
  entries: DirectoryEntry[]
  uploading: number
  browse: (path: string) => void
  upload: (path: string, file: File) => Promise<void>
  report: (error: unknown) => void
}) {
  const form = useForm({
    defaultValues: { path },
    validators: { onSubmit: z.object({ path: z.string() }) },
    onSubmit: ({ value }) => {
      try {
        browse(value.path)
      } catch (error) {
        report(error)
      }
    },
  })
  return (
    <div className="space-y-4">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field
            name="path"
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>远端路径</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          />
          <form.Subscribe
            selector={(state) => state.isSubmitting}
            children={(isSubmitting) => (
              <LoadingButton type="submit" loading={isSubmitting}>
                打开路径
              </LoadingButton>
            )}
          />
        </FieldGroup>
      </form>
      <label>
        上传文件
        <Input
          type="file"
          multiple
          aria-label="上传会话文件"
          disabled={uploading > 0}
          onChange={(event) => {
            for (const file of event.target.files ?? [])
              void upload(path, file).catch(report)
            event.target.value = ''
          }}
        />
      </label>
      {uploading > 0 ? (
        <p role="status">开始上传，在上传成功提示出现前请勿上传其他文件！</p>
      ) : null}
      {path !== '/' ? (
        <Button
          variant="outline"
          onClick={() => {
            try {
              browse(path.split('/').slice(0, -1).join('/') || '/')
            } catch (error) {
              report(error)
            }
          }}
        >
          返回上级
        </Button>
      ) : null}
      {entries.length === 0 ? (
        <p>此文件夹为空</p>
      ) : (
        <ul>
          {entries.map((item) => (
            <li key={item.path}>
              <Button
                variant="ghost"
                onDoubleClick={() => {
                  if (item.type.includes('stream-index+json')) {
                    try {
                      browse(item.path)
                    } catch (error) {
                      report(error)
                    }
                  }
                }}
                onClick={() => {
                  if (!item.type.includes('stream-index+json')) {
                    try {
                      browse(item.path)
                    } catch (error) {
                      report(error)
                    }
                  }
                }}
              >
                {item.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
