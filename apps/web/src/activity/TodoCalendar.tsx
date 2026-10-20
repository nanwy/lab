import { Calendar } from '@workspace/ui/components/calendar'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import type { Todo } from '../api/activity'
import { useId } from 'react'

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function TodoCalendar({
  todos,
  date,
  setDate,
  mode,
  setMode,
  selectMonth,
}: {
  todos: Todo[]
  date: Date
  setDate: (date: Date) => void
  mode: string
  setMode: (mode: string) => void
  selectMonth: (date: Date) => void
}) {
  const yearId = useId()
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          aria-pressed={mode === 'month'}
          variant={mode === 'month' ? 'default' : 'outline'}
          onClick={() => setMode('month')}
        >
          月视图
        </Button>
        <Button
          aria-pressed={mode === 'year'}
          variant={mode === 'year' ? 'default' : 'outline'}
          onClick={() => setMode('year')}
        >
          年视图
        </Button>
      </div>
      {mode === 'month' ? (
        <Calendar
          labels={{ labelDayButton: dateKey }}
          mode="single"
          selected={date}
          month={date}
          onMonthChange={setDate}
          onSelect={(value) => {
            if (value) setDate(value)
          }}
          modifiers={{
            hasTodo: (d) =>
              todos.some((t) => t.set_time.startsWith(dateKey(d))),
          }}
          modifiersClassNames={{ hasTodo: 'underline font-bold' }}
        />
      ) : (
        <div className="space-y-4">
          <Label htmlFor={yearId}>年份</Label>
          <Input
            id={yearId}
            type="number"
            min={1}
            max={9999}
            value={date.getFullYear()}
            onChange={(e) => {
              const year = e.target.valueAsNumber
              if (year >= 1 && year <= 9999) setDate(new Date(year, 0, 1))
            }}
          />
          <div
            role="group"
            aria-label="年度待办"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            {Array.from({ length: 12 }, (_, month) => {
              const key = `${date.getFullYear()}-${String(month + 1).padStart(2, '0')}`
              const entries = todos.filter((t) => t.set_time.startsWith(key))
              return (
                <Button
                  key={key}
                  variant="outline"
                  className="h-auto min-h-20 flex-col items-start whitespace-normal p-3 text-left"
                  onClick={() =>
                    selectMonth(new Date(date.getFullYear(), month, 1))
                  }
                >
                  <span className="font-semibold">{month + 1} 月</span>
                  {entries.length ? (
                    entries.map((t) => (
                      <span
                        key={t.id}
                        className="max-w-full break-words text-xs"
                      >
                        {t.content} · {t.if_finish ? '已完成' : '未完成'}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      暂无待办
                    </span>
                  )}
                </Button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
