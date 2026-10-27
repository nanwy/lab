import { useEffect, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import {
  RadioGroup,
  RadioGroupItem,
} from '@workspace/ui/components/radio-group'
import { Checkbox } from '@workspace/ui/components/checkbox'
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldError,
  FieldSet,
  FieldLegend,
} from '@workspace/ui/components/field'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { toast } from '@workspace/ui/components/sonner'
import {
  getCourseSectionTest,
  saveCourseTestAnswer,
  finishCourseSectionTest,
  resetCourseSectionTest,
  courseTestKey,
  type CourseTestScope,
  type CourseSectionTest as SectionTestData,
  type CourseTestQuestion,
} from '../api/course-tests'
import type { CourseId } from '../api/courses'
import { usePageSignal } from '../auth/use-page-signal'
import { CourseDialog } from './CourseDialog'
import { CourseError, reportCourseError } from './CourseFeedback'

export function CourseSectionTest({
  scope,
  account,
  close,
}: {
  scope: CourseTestScope
  account: CourseId
  close: () => void
}) {
  const client = useQueryClient()
  const signalForTest = usePageSignal()
  const key = courseTestKey(account, scope)
  const detail = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getCourseSectionTest(scope, signal),
    retry: false,
  })
  const [busy, setBusy] = useState(false)
  async function save(questionId: CourseId, option: string[]) {
    if (busy || !detail.data || detail.data.done || detail.isError) return false
    const signal = signalForTest()
    setBusy(true)
    try {
      await client.cancelQueries({ queryKey: key })
      await saveCourseTestAnswer(scope, questionId, option, signal)
      if (signal.aborted) return false
      client.setQueryData<SectionTestData>(key, (old) =>
        old
          ? {
              ...old,
              results: old.results.map((q) =>
                q.id === questionId ? { ...q, user_option: option } : q,
              ),
            }
          : old,
      )
      return true
    } catch (error) {
      reportCourseError(error, signal)
      return false
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  async function submit() {
    if (busy || !detail.data || detail.isError) return
    const signal = signalForTest()
    const resetting = detail.data.done
    setBusy(true)
    try {
      await client.cancelQueries({ queryKey: key })
      const result = await (resetting
        ? resetCourseSectionTest(scope, signal)
        : finishCourseSectionTest(scope, signal))
      if (signal.aborted) return
      if (resetting) {
        if (result.message) toast.success(result.message)
      } else toast.success('提交成功')
      await client.invalidateQueries({ queryKey: key })
    } catch (error) {
      reportCourseError(error, signal)
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  return (
    <CourseDialog title="本节测试" close={close} draggable>
      {detail.isPending ? (
        <Loading label="正在读取本节测试…" />
      ) : detail.isError ? (
        <CourseError
          title="章节测试读取失败"
          error={detail.error}
          retry={() => void detail.refetch()}
        />
      ) : !detail.data.results.length ? (
        <p>该小节暂无自测题</p>
      ) : (
        <div className="space-y-6">
          {detail.data.results.map((q, index) => (
            <Question
              key={`${q.id}:${detail.data.done}`}
              question={q}
              index={index}
              done={detail.data.done}
              busy={busy || detail.isFetching}
              save={(option) => save(q.id, option)}
            />
          ))}
          <LoadingButton
            loading={busy}
            disabled={detail.isFetching}
            onClick={() => void submit()}
          >
            {detail.data.done ? '重新测试' : '提交答案'}
          </LoadingButton>
        </div>
      )}
    </CourseDialog>
  )
}
const selection = z.object({ option: z.array(z.string()) })
function Question({
  question: q,
  index,
  done,
  busy,
  save,
}: {
  question: CourseTestQuestion
  index: number
  done: boolean
  busy: boolean
  save: (option: string[]) => Promise<boolean>
}) {
  const form = useForm({
    defaultValues: { option: q.user_option },
    validators: { onSubmit: selection },
  })
  useEffect(() => {
    form.reset({ option: q.user_option })
  }, [form, q.user_option])
  return (
    <section
      aria-label={`第${index + 1}题`}
      className="space-y-3 border-b pb-5"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field
            name="option"
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              const change = async (option: string[]) => {
                if (await save(option)) field.handleChange(option)
              }
              return (
                <Field data-invalid={isInvalid}>
                  <FieldSet>
                    <FieldLegend>
                      {index + 1}、【
                      {{ 1: '单选', 2: '多选', 3: '判断' }[q.option_type]}】
                      {q.name}
                    </FieldLegend>
                    {q.option_type === 2 ? (
                      <div className="space-y-2">
                        {Object.entries(q.content).map(([value, label]) => {
                          const id = `question-${q.id}-${value}`
                          return (
                            <div
                              key={value}
                              className="flex items-center gap-2"
                            >
                              <Checkbox
                                id={id}
                                name={field.name}
                                checked={field.state.value.includes(value)}
                                aria-invalid={isInvalid}
                                disabled={done || busy}
                                onBlur={field.handleBlur}
                                onCheckedChange={(checked) =>
                                  void change(
                                    checked
                                      ? [...field.state.value, value]
                                      : field.state.value.filter(
                                          (v) => v !== value,
                                        ),
                                  )
                                }
                              />
                              <FieldLabel htmlFor={id}>
                                {value}：{label}
                              </FieldLabel>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <RadioGroup
                        name={field.name}
                        value={field.state.value[0] ?? ''}
                        onBlur={field.handleBlur}
                        aria-invalid={isInvalid}
                        disabled={done || busy}
                        onValueChange={(value) => void change([value])}
                      >
                        {Object.entries(q.content).map(([value, label]) => {
                          const id = `question-${q.id}-${value}`
                          return (
                            <div
                              key={value}
                              className="flex items-center gap-2"
                            >
                              <RadioGroupItem id={id} value={value} />
                              <FieldLabel htmlFor={id}>
                                {value}：{label}
                              </FieldLabel>
                            </div>
                          )
                        })}
                      </RadioGroup>
                    )}
                  </FieldSet>
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          />
        </FieldGroup>
      </form>
      {done ? (
        <div className="space-y-2 text-sm">
          <p
            className={
              q.status === 1
                ? 'text-green-700'
                : q.status === 0
                  ? 'text-amber-700'
                  : 'text-destructive'
            }
          >
            {q.status === 1 ? '正确' : q.status === 0 ? '未答' : '错误'}
          </p>
          {q.status !== 1 ? <p>正确答案：{q.answer?.join('、')}</p> : null}
          <p>解析：{q.parse}</p>
        </div>
      ) : null}
    </section>
  )
}
