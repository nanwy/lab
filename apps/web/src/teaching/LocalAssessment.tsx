import { create } from 'zustand'
import { Button } from '@workspace/ui/components/button'
import { Checkbox } from '@workspace/ui/components/checkbox'
import {
  RadioGroup,
  RadioGroupItem,
} from '@workspace/ui/components/radio-group'
import { teachingData, type TeachingQuestion } from './data'

const questions = teachingData.testPaper.theoryList as TeachingQuestion[]
// 与原 Bce 一致：只在内存保留答题，页签销毁或离页不重置。
const useAssessment = create(() => ({
  answers: questions.map(() => [] as string[]),
  submittedAt: '',
}))

function localTime() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

export function LocalAssessment() {
  const answers = useAssessment((state) => state.answers)
  const submittedAt = useAssessment((state) => state.submittedAt)
  const results = questions.map((question, index) =>
    answers[index]!.length === 0
      ? '未答'
      : answers[index]!.length === question.answer.length &&
          question.answer.every((option) => answers[index]!.includes(option))
        ? '正确'
        : '错误',
  )
  function submit() {
    useAssessment.setState({ submittedAt: localTime() })
  }
  function reset() {
    useAssessment.setState({
      answers: questions.map(() => []),
      submittedAt: '',
    })
  }
  function choose(index: number, option: string, checked: boolean) {
    useAssessment.setState((state) => ({
      answers: state.answers.map((answer, position) =>
        position !== index
          ? answer
          : questions[index]!.option_type !== 2
            ? [option]
            : checked
              ? [...answer, option]
              : answer.filter((value) => value !== option),
      ),
    }))
  }
  return (
    <div className="flex gap-5">
      <div className="max-h-[65vh] min-w-0 flex-[2] overflow-auto px-5">
        {questions.map((question, index) => (
          <fieldset
            key={index}
            id={`assessment-${index}`}
            className="mb-6 border-b pb-5"
          >
            <legend className="mb-3 font-semibold">
              {index + 1}、({question.score}分) 【
              {
                ({ 1: '单选', 2: '多选', 3: '判断' } as Record<number, string>)[
                  question.option_type
                ]
              }
              】{question.name}
            </legend>
            {question.option_type === 2 ? (
              <div className="space-y-2">
                {Object.entries(question.content).map(([option, text]) => (
                  <label key={option} className="flex items-center gap-2">
                    <Checkbox
                      checked={answers[index]!.includes(option)}
                      disabled={!!submittedAt}
                      onCheckedChange={(checked) =>
                        choose(index, option, checked === true)
                      }
                    />
                    {option}：{text}
                  </label>
                ))}
              </div>
            ) : (
              <RadioGroup
                value={answers[index]![0] ?? ''}
                disabled={!!submittedAt}
                onValueChange={(value) => choose(index, value, true)}
              >
                {Object.entries(question.content).map(([option, text]) => (
                  <label key={option} className="flex items-center gap-2">
                    <RadioGroupItem value={option} />
                    {option}：{text}
                  </label>
                ))}
              </RadioGroup>
            )}
            {submittedAt ? (
              <div className="mt-4 space-y-2">
                <p
                  className={
                    results[index] === '正确'
                      ? 'text-green-600'
                      : results[index] === '未答'
                        ? 'text-amber-600'
                        : 'text-red-600'
                  }
                >
                  {results[index]}
                </p>
                {results[index] !== '正确' ? (
                  <p>正确答案：{question.answer.join('、')}</p>
                ) : null}
                <p>解析：{question.parse}</p>
              </div>
            ) : null}
          </fieldset>
        ))}
      </div>
      <aside className="flex-1 p-5">
        {submittedAt ? (
          <dl className="space-y-3 border p-4">
            <dt>题目数量</dt>
            <dd>{questions.length}道题</dd>
            <dt>答题情况</dt>
            <dd>
              正确{results.filter((result) => result === '正确').length}道，错误
              {results.filter((result) => result === '错误').length}道，未答
              {results.filter((result) => result === '未答').length}道
            </dd>
            <dt>交卷时间</dt>
            <dd>{submittedAt}</dd>
            <dd>
              <Button onClick={reset}>重置试卷</Button>
            </dd>
          </dl>
        ) : (
          <>
            <h3 className="mb-4 font-semibold">答题卡</h3>
            <div className="flex flex-wrap gap-2">
              {questions.map((_, index) => (
                <Button
                  key={index}
                  aria-label={`第${index + 1}题`}
                  aria-pressed={answers[index]!.length > 0}
                  variant={answers[index]!.length ? 'default' : 'outline'}
                  onClick={() =>
                    document
                      .getElementById(`assessment-${index}`)
                      ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                  }
                >
                  {index + 1}
                </Button>
              ))}
            </div>
            <Button className="mt-5" onClick={submit}>
              提交答案
            </Button>
          </>
        )}
      </aside>
    </div>
  )
}
