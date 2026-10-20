import NiceModal, { useModal } from '@ebay/nice-modal-react'
import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from '@workspace/ui/components/sonner'
import { ApiError } from '../api'
import { Button } from '@workspace/ui/components/button'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { Input } from '@workspace/ui/components/input'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Field,
  FieldGroup,
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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@workspace/ui/components/alert-dialog'
import { addTodo, changeTodo, newTodoSchema, type Todo } from '../api/activity'
import { usePageSignal } from '../auth/use-page-signal'
import { ActivityTable } from './ActivityTable'
import { dateKey, TodoCalendar } from './TodoCalendar'
import { refreshTodos, todosOptions } from './queries'

const DeleteTodoModal = NiceModal.create(({ todo }: { todo: Todo }) => {
  const modal = useModal()
  const client = useQueryClient()
  const signalForPage = usePageSignal()
  function close() {
    modal.resolve()
    modal.remove()
  }
  async function remove() {
    const signal = signalForPage()
    try {
      await changeTodo(todo.id, 1, signal)
      if (signal.aborted) return
      await refreshTodos(client)
      if (!signal.aborted) close()
    } catch (error) {
      if (signal.aborted) return
      if (!(error instanceof ApiError) || !error.handled)
        toast.error(
          error instanceof ApiError ? error.message : '删除失败，请重试',
        )
    }
  }
  return (
    <AlertDialog
      open={modal.visible}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除当前事项</AlertDialogTitle>
          <AlertDialogDescription>
            确认删除“{todo.content}”？删除后不可恢复。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <LoadingButton variant="destructive" onClick={remove}>
            确认删除
          </LoadingButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
})

export const TodosModal = NiceModal.create(() => {
  const modal = useModal()
  const [date, setDate] = useState(new Date())
  const [mode, setMode] = useState('month')
  const client = useQueryClient()
  const signalForPage = usePageSignal()
  const todos = useQuery(todosOptions)
  const form = useForm({
    defaultValues: { content: '', set_time: '' },
    validators: { onSubmit: newTodoSchema },
    onSubmit: async ({ value, formApi }) => {
      const signal = signalForPage()
      await addTodo(value, signal)
      if (signal.aborted) return
      formApi.setFieldValue('content', '')
      await refreshTodos(client)
      if (!signal.aborted) toast.success('待办已创建。')
    },
  })
  function selectDate(value: Date) {
    setDate(value)
    const nextHour = new Date(value)
    nextHour.setHours(value.getHours() + 1, 0, 0, 0)
    form.setFieldValue(
      'set_time',
      `${dateKey(nextHour)} ${String(nextHour.getHours()).padStart(2, '0')}:00:00`,
    )
  }
  async function finish(todo: Todo) {
    const signal = signalForPage()
    try {
      await changeTodo(todo.id, 2, signal)
      if (!signal.aborted) await refreshTodos(client)
    } catch (error) {
      if (signal.aborted) return
      if (!(error instanceof ApiError) || !error.handled)
        toast.error(
          error instanceof ApiError ? error.message : '标注完成失败，请重试',
        )
    }
  }
  const columns = [
    { accessorKey: 'content', header: '事项内容' },
    { accessorKey: 'set_time', header: '时间' },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }: { row: { original: Todo } }) => (
        <div className="flex flex-wrap gap-2">
          <LoadingButton
            variant="outline"
            disabled={row.original.if_finish}
            onClick={() => finish(row.original)}
          >
            {row.original.if_finish ? '已完成' : '标注完成'}
          </LoadingButton>
          <Button
            variant="outline"
            onClick={() => {
              void NiceModal.show(DeleteTodoModal, { todo: row.original })
            }}
          >
            删除
          </Button>
        </div>
      ),
    },
  ]
  const prefix = mode === 'year' ? dateKey(date).slice(0, 7) : dateKey(date)
  const visible =
    todos.data?.filter((todo) => todo.set_time.startsWith(prefix)) ?? []
  return (
    <Dialog
      open={modal.visible}
      onOpenChange={(open) => {
        if (!open) {
          modal.resolve()
          modal.remove()
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>待办事项</DialogTitle>
          <DialogDescription>
            新增事项、标注完成或删除，状态与首页同步。
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void form.handleSubmit().catch((error: unknown) => {
                  if (!(error instanceof ApiError) || !error.handled)
                    toast.error(
                      error instanceof ApiError
                        ? error.message
                        : '提交失败，请重试',
                    )
                })
              }}
            >
              <FieldGroup>
                <form.Field
                  name="content"
                  children={(field) => {
                    const isInvalid =
                      field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>待办内容</FieldLabel>
                        <Textarea
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
                <form.Field
                  name="set_time"
                  children={(field) => {
                    const isInvalid =
                      field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>待办时间</FieldLabel>
                        <Input
                          type="datetime-local"
                          step={1}
                          id={field.name}
                          name={field.name}
                          value={field.state.value.replace(' ', 'T')}
                          onBlur={field.handleBlur}
                          onChange={(event) => {
                            const value = event.target.value
                            field.handleChange(
                              value.replace('T', ' ') +
                                (value.length === 16 ? ':00' : ''),
                            )
                          }}
                          aria-invalid={isInvalid}
                        />
                        {isInvalid && (
                          <FieldError errors={field.state.meta.errors} />
                        )}
                      </Field>
                    )
                  }}
                />
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(busy) => (
                    <LoadingButton type="submit" loading={busy}>
                      保存待办
                    </LoadingButton>
                  )}
                </form.Subscribe>
              </FieldGroup>
            </form>
            <h3 className="font-semibold">
              {mode === 'year' ? '当月任务' : '当天任务'} · {prefix}
            </h3>
            {todos.isPending ? (
              <p role="status">正在读取待办…</p>
            ) : todos.isError ? (
              <Alert variant="destructive">
                <AlertDescription>
                  待办读取失败。
                  <Button variant="link" onClick={() => void todos.refetch()}>
                    重试待办
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <ActivityTable
                name="待办列表"
                data={visible}
                columns={columns}
                empty="暂无任务"
              />
            )}
          </div>
          <TodoCalendar
            todos={todos.data ?? []}
            date={date}
            setDate={selectDate}
            mode={mode}
            setMode={setMode}
            selectMonth={setDate}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
})
