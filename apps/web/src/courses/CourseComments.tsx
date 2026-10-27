import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { Button } from '@workspace/ui/components/button'
import { Textarea } from '@workspace/ui/components/textarea'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from '@workspace/ui/components/field'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { Loading } from '@workspace/ui/components/loading'
import { toast } from '@workspace/ui/components/sonner'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@workspace/ui/components/alert-dialog'
import {
  getCourseComments,
  addCourseComment,
  deleteCourseComment,
  courseCommentSchema,
  type CourseId,
  type CourseComment,
} from '../api/courses'
import { usePageSignal } from '../auth/use-page-signal'
import { ListPagination } from '../activity/ActivityTable'
import { CourseDialog } from './CourseDialog'
import { CourseError, reportCourseError } from './CourseFeedback'

export function CourseComments({
  courseId,
  account,
  username,
  close,
}: {
  courseId: string
  account: CourseId
  username?: string
  close: () => void
}) {
  const [page, setPage] = useState(1)
  return (
    <CourseDialog title="评论" close={close}>
      <CommentPage
        key={page}
        courseId={courseId}
        account={account}
        username={username}
        page={page}
        changePage={setPage}
      />
    </CourseDialog>
  )
}
function CommentPage({
  courseId,
  account,
  username,
  page,
  changePage,
}: {
  courseId: string
  account: CourseId
  username?: string
  page: number
  changePage: (page: number) => void
}) {
  const list = useQuery({
    queryKey: ['courses', account, courseId, 'comments', page],
    queryFn: ({ signal }) => getCourseComments(courseId, page, signal),
    retry: false,
  })
  const [reply, setReply] = useState<CourseId | null>(null)
  const [deleting, setDeleting] = useState<CourseId | null>(null)
  const [pending, setPending] = useState(false)
  const signalForPage = usePageSignal()
  const refresh = async () => {
    await list.refetch()
  }
  async function remove() {
    if (deleting === null || pending) return
    const signal = signalForPage()
    setPending(true)
    try {
      await deleteCourseComment(courseId, deleting, signal)
      if (signal.aborted) return
      toast.success('删除成功')
      setDeleting(null)
      if (list.data?.results.length === 1 && page > 1) changePage(page - 1)
      else await refresh()
    } catch (error) {
      reportCourseError(error, signal)
    } finally {
      if (!signal.aborted) setPending(false)
    }
  }
  return (
    <div className="space-y-5">
      <CommentForm courseId={courseId} refresh={refresh} />
      {list.isPending ? (
        <Loading label="正在读取课程评论…" />
      ) : list.isError ? (
        <CourseError
          error={list.error}
          title="课程评论读取失败"
          retry={() => void list.refetch()}
        />
      ) : (
        <>
          {list.data.results.map((comment) => (
            <article key={comment.id} className="space-y-3 border-t py-4">
              <CommentBody comment={comment} />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setReply(reply === comment.id ? null : comment.id)
                  }
                >
                  回复
                </Button>
                {username && comment.username === username ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleting(comment.id)}
                  >
                    删除
                  </Button>
                ) : null}
              </div>
              {reply === comment.id ? (
                <CommentForm
                  key={comment.id}
                  courseId={courseId}
                  commentId={comment.id}
                  refresh={refresh}
                />
              ) : null}
              <div className="space-y-3 border-l-2 pl-5">
                {comment.comment.map((item, index) => (
                  <CommentBody key={index} comment={item} />
                ))}
              </div>
            </article>
          ))}
          {!list.data.results.length ? (
            <p className="py-10 text-center">暂无评论内容</p>
          ) : null}
          <ListPagination
            page={page}
            size={10}
            count={list.data.count}
            change={changePage}
            busy={list.isFetching || pending}
          />
        </>
      )}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定要删除当前评论？</AlertDialogTitle>
            <AlertDialogDescription>删除后无法恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
            <LoadingButton loading={pending} onClick={() => void remove()}>
              确定删除
            </LoadingButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
function CommentBody({
  comment,
}: {
  comment: Pick<
    CourseComment,
    'username' | 'logo' | 'created' | 'role' | 'content'
  >
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {comment.logo ? (
          <img className="size-10 rounded-full" src={comment.logo} alt="" />
        ) : null}
        <strong>{comment.username}</strong>
        <span className="text-muted-foreground">
          {comment.role === 1 ? '学员' : '教员'} {comment.created}
        </span>
      </div>
      <pre className="whitespace-pre-wrap break-words font-sans text-sm">
        {comment.content}
      </pre>
    </div>
  )
}
function CommentForm({
  courseId,
  commentId,
  refresh,
}: {
  courseId: string
  commentId?: CourseId
  refresh: () => Promise<void>
}) {
  const signalForPage = usePageSignal()
  const fieldName = commentId === undefined ? 'comment' : 'reply'
  const form = useForm({
    defaultValues: { [fieldName]: '' },
    validators: {
      onSubmit: z.object({ [fieldName]: courseCommentSchema.shape.content }),
    },
    onSubmit: async ({ value }) => {
      const signal = signalForPage()
      try {
        await addCourseComment(courseId, value[fieldName]!, commentId, signal)
        if (signal.aborted) return
        form.reset()
        toast.success('评论成功！')
        await refresh()
      } catch (error) {
        reportCourseError(error, signal)
      }
    },
  })
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.Field
          name={fieldName}
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>
                  {commentId === undefined ? '评论内容' : '回复内容'}
                </FieldLabel>
                <Textarea
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                  placeholder={
                    commentId === undefined
                      ? '请输入评论或问题'
                      : '请留下您的精彩回答'
                  }
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
      </FieldGroup>
      <div className="text-right">
        <form.Subscribe
          selector={(state) => state.isSubmitting}
          children={(submitting) => (
            <LoadingButton loading={submitting} type="submit">
              {commentId === undefined ? '提交' : '回答'}
            </LoadingButton>
          )}
        />
      </div>
    </form>
  )
}
