import { create } from 'zustand'
import { Button } from '@workspace/ui/components/button'
import { Checkbox } from '@workspace/ui/components/checkbox'
import {
  RadioGroup,
  RadioGroupItem,
} from '@workspace/ui/components/radio-group'
import { teachingData } from './data'

interface PracticeAnswer {
  selected: string[]
  done: boolean
}

// 与原 Bce 一样只保留全局内存，页签卸载不清理，刷新后重新初始化。
const usePractice = create(() => ({
  answers: teachingData.topicList.map(() => ({
    selected: [] as string[],
    done: false,
  })),
}))

function updateAnswer(index: number, change: Partial<PracticeAnswer>) {
  usePractice.setState((state) => ({
    answers: state.answers.map((answer, position) =>
      position === index ? { ...answer, ...change } : answer,
    ),
  }))
}

export function TopicPractice() {
  const answers = usePractice((state) => state.answers)
  return (
    <div className="h-full space-y-6 overflow-auto px-10 py-4">
      {teachingData.topicList.map((question, index) => {
        // 固定题库与答题数组一一对应，更新只替换元素，不增删。
        const { selected, done } = answers[index]!
        const result =
          selected.length === 0
            ? '未答'
            : selected.length === question.answer.length &&
                question.answer.every((option) => selected.includes(option))
              ? '正确'
              : '错误'
        const title = `${index + 1}、(${question.score}分) 【${{ 1: '单选', 2: '多选', 3: '判断' }[question.option_type]}】${question.name}`
        return (
          <fieldset key={index} className="space-y-3 border-b pb-6">
            <legend className="mb-3 font-medium">{title}</legend>
            <div className="flex gap-5">
              <Button
                size="sm"
                onClick={() => updateAnswer(index, { done: true })}
              >
                提交
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  updateAnswer(index, { selected: [], done: false })
                }
              >
                重答
              </Button>
            </div>
            {question.option_type === 2 ? (
              <div className="grid gap-3">
                {Object.entries(question.content).map(([option, content]) => (
                  <label key={option} className="flex items-center gap-2">
                    <Checkbox
                      checked={selected.includes(option)}
                      disabled={done}
                      onCheckedChange={(checked) =>
                        updateAnswer(index, {
                          selected: checked
                            ? [...selected, option]
                            : selected.filter((value) => value !== option),
                        })
                      }
                    />
                    {option}：{content}
                  </label>
                ))}
              </div>
            ) : (
              <RadioGroup
                value={selected[0] ?? ''}
                disabled={done}
                onValueChange={(option) =>
                  updateAnswer(index, { selected: [option] })
                }
              >
                {Object.entries(question.content).map(([option, content]) => (
                  <label key={option} className="flex items-center gap-2">
                    <RadioGroupItem value={option} />
                    {option}：{content}
                  </label>
                ))}
              </RadioGroup>
            )}
            {done ? (
              <div className="space-y-2">
                <p
                  className={
                    result === '正确'
                      ? 'text-[#87d068]'
                      : result === '未答'
                        ? 'text-[#FEAA29]'
                        : 'text-[#FF4747]'
                  }
                >
                  {result}
                </p>
                {result !== '正确' ? (
                  <p>正确答案：{question.answer.join('、')}</p>
                ) : null}
                <p>解析：{question.parse}</p>
              </div>
            ) : null}
          </fieldset>
        )
      })}
    </div>
  )
}
