import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { Button } from '@workspace/ui/components/button'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@workspace/ui/components/dialog'
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldError,
} from '@workspace/ui/components/field'
import { Input } from '@workspace/ui/components/input'
import { toast } from '@workspace/ui/components/sonner'
import { ApiError } from '../api'
import {
  cleanFileName,
  fileNameSchema,
  createFileFolder,
  renamePersonalFile,
  deletePersonalFiles,
  sharePersonalFile,
} from '../api/personal-files'
import type { DriveFile } from '../api/files'
import { usePageSignal } from '../auth/use-page-signal'
import type { FileActionsContext } from './FileDrivePage'
import { FileExportButton } from './FileExportButton'
import './personal-files.css'

function report(error: unknown, signal: AbortSignal) {
  if (signal.aborted) return
  if (!(error instanceof ApiError) || !error.handled)
    toast.error(error instanceof Error ? error.message : '操作失败，请重试')
}

export function PersonalFileActions({
  context,
}: {
  context: FileActionsContext
}) {
  const [dialog, setDialog] = useState<'create' | 'delete' | null>(null)
  return (
    <>
      <Button variant="outline" onClick={() => setDialog('create')}>
        新建文件夹
      </Button>
      <FileExportButton scope="personal" context={context} />
      <Button
        variant="outline"
        className="personal-delete"
        disabled={!context.selected.length}
        onClick={() => setDialog('delete')}
      >
        批量删除
      </Button>
      {dialog === 'create' ? (
        <NameDialog context={context} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'delete' ? (
        <DeleteDialog
          context={context}
          files={context.selected}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  )
}
export function PersonalFileRowActions({
  file,
  context,
}: {
  file: DriveFile
  context: FileActionsContext
}) {
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
  const [pending, setPending] = useState(false)
  const signalForPage = usePageSignal()
  async function share() {
    const signal = signalForPage()
    setPending(true)
    try {
      await sharePersonalFile(file.id, file.is_share !== 1, signal)
      if (signal.aborted) return
      await context.refresh()
    } catch (error) {
      report(error, signal)
    } finally {
      if (!signal.aborted) setPending(false)
    }
  }
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        role="switch"
        aria-checked={file.is_share === 1}
        aria-label={`共享 ${file.name}`}
        disabled={file.is_shared_file || pending}
        onClick={() => void share()}
      >
        {pending ? '更新中…' : file.is_share === 1 ? '取消共享' : '共享'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={file.is_shared_file}
        onClick={() => setDialog('rename')}
      >
        重命名
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="personal-delete"
        disabled={file.is_shared_file}
        onClick={() => setDialog('delete')}
      >
        删除
      </Button>
      {dialog === 'rename' ? (
        <NameDialog
          context={context}
          file={file}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'delete' ? (
        <DeleteDialog
          context={context}
          files={[file]}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  )
}
function NameDialog({
  file,
  context,
  onClose,
}: {
  file?: DriveFile
  context: FileActionsContext
  onClose: () => void
}) {
  const signalForDialog = usePageSignal()
  const form = useForm({
    defaultValues: {
      name: file ? file.path.slice(file.path.lastIndexOf('/') + 1) : '',
    },
    validators: { onSubmit: fileNameSchema },
    onSubmit: async ({ value }) => {
      const signal = signalForDialog()
      try {
        if (file) await renamePersonalFile(file.id, value.name, signal)
        else await createFileFolder(value.name, context.path, signal)
        if (signal.aborted) return
        await context.refresh()
        if (!signal.aborted) {
          toast.success(file ? '重命名成功' : '创建文件夹成功')
          onClose()
        }
      } catch (error) {
        report(error, signal)
      }
    },
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="personal-file-dialog">
        <DialogHeader>
          <DialogTitle>{file ? '重命名' : '创建文件夹'}</DialogTitle>
          <DialogDescription>
            {file ? '为资料设置便于识别的名称。' : '文件夹将创建在当前目录中。'}
          </DialogDescription>
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
                      onChange={(event) =>
                        field.handleChange(cleanFileName(event.target.value))
                      }
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />
          </FieldGroup>
          <div className="personal-dialog-footer">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <form.Subscribe
              selector={(state) => state.isSubmitting}
              children={(isSubmitting) => (
                <LoadingButton type="submit" loading={isSubmitting}>
                  {file ? '保存名称' : '创建'}
                </LoadingButton>
              )}
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
function DeleteDialog({
  files,
  context,
  onClose,
}: {
  files: DriveFile[]
  context: FileActionsContext
  onClose: () => void
}) {
  const signalForDialog = usePageSignal()
  // 固定确认时的对象；表格后续选择变化不改变确认范围。
  const [targets] = useState(() => files.map((file) => file.id))
  const [pending, setPending] = useState(false)
  async function remove() {
    const signal = signalForDialog()
    setPending(true)
    try {
      await deletePersonalFiles(targets, signal)
      if (signal.aborted) return
      context.clearSelection()
      await context.refresh()
      if (!signal.aborted) {
        toast.success('删除成功')
        onClose()
      }
    } catch (error) {
      report(error, signal)
    } finally {
      if (!signal.aborted) setPending(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="personal-file-dialog">
        <DialogHeader>
          <DialogTitle>删除文件</DialogTitle>
          <DialogDescription>
            确认删除选中的 {targets.length} 个文件或文件夹？删除后无法恢复。
          </DialogDescription>
        </DialogHeader>
        <div className="personal-dialog-footer">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <LoadingButton
            variant="destructive"
            loading={pending}
            onClick={remove}
          >
            确认删除
          </LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
