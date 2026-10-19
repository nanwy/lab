import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Calendar } from '@workspace/ui/components/calendar'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { getHomeCollections, getHomeTodos } from '../api/portal'

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function HomePersonalSummary() {
  const todos = useQuery({
    queryKey: ['account', 'todos', 'all'],
    queryFn: ({ signal }) => getHomeTodos(signal),
    retry: false,
  })
  const collections = useQuery({
    queryKey: ['account', 'collections', 'home'],
    queryFn: ({ signal }) => getHomeCollections(signal),
    retry: false,
  })
  const [date, setDate] = useState(new Date())
  const [mode, setMode] = useState('month')
  const [notice, setNotice] = useState('')
  const selected = dateKey(date)
  const visible = todos.data?.filter((t) => t.set_time.startsWith(selected))
  return (
    <aside className="space-y-6">
      <section className="space-y-4 border-t pt-5">
        <h2 className="text-xl font-semibold">待办事项</h2>
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
                Boolean(
                  todos.data?.some((t) => t.set_time.startsWith(dateKey(d))),
                ),
            }}
            modifiersClassNames={{ hasTodo: 'underline font-bold' }}
          />
        ) : (
          <div className="space-y-4">
            <label className="grid gap-2">
              年份
              <Input
                type="number"
                min={1}
                max={9999}
                value={date.getFullYear()}
                onChange={(e) => {
                  const year = e.target.valueAsNumber
                  if (year >= 1 && year <= 9999) setDate(new Date(year, 0, 1))
                }}
              />
            </label>
            <div
              role="group"
              aria-label="年度待办"
              className="grid grid-cols-2 gap-3"
            >
              {Array.from({ length: 12 }, (_, month) => {
                const key = `${date.getFullYear()}-${String(month + 1).padStart(2, '0')}`
                const entries = todos.data?.filter((t) =>
                  t.set_time.startsWith(key),
                )
                return (
                  <Button
                    key={key}
                    variant="outline"
                    className="h-auto min-h-20 flex-col items-start whitespace-normal p-3 text-left"
                    onClick={() => {
                      setDate(new Date(date.getFullYear(), month, 1))
                      setMode('month')
                    }}
                  >
                    <span className="font-semibold">{month + 1} 月</span>
                    {entries?.length ? (
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
        {todos.isPending ? (
          <p role="status">正在读取待办…</p>
        ) : todos.isError ? (
          <div role="alert">
            待办读取失败。
            <Button variant="link" onClick={() => void todos.refetch()}>
              重试待办
            </Button>
          </div>
        ) : mode === 'year' ? null : visible?.length ? (
          <ul className="space-y-3">
            {visible.map((t) => (
              <li
                key={t.id}
                className="break-words"
                title={`事项内容：${t.content}；${t.if_finish ? '已完成' : '未完成'}`}
              >
                <time>{t.set_time}</time>
                <p>
                  {t.content} · {t.if_finish ? '已完成' : '未完成'}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">暂无待办事项</p>
        )}
      </section>
      <section className="space-y-4 border-t pt-5">
        <div className="flex justify-between gap-3">
          <h2 className="text-xl font-semibold">我的收藏</h2>
          <Link
            className="text-primary underline"
            to="/basic/$"
            params={{ _splat: 'personal/enshrine' }}
          >
            查看更多收藏
          </Link>
        </div>
        {collections.isPending ? (
          <p role="status">正在读取收藏…</p>
        ) : collections.isError ? (
          <div role="alert">
            收藏读取失败。
            <Button variant="link" onClick={() => void collections.refetch()}>
              重试收藏
            </Button>
          </div>
        ) : collections.data.length ? (
          <ul>
            {collections.data.map((item) => (
              <li key={item.id}>
                {item.is_status && item.attribute === 1 ? (
                  <Link
                    className="text-primary underline"
                    to="/basic/$"
                    params={{ _splat: `training/course/${item.object_id}` }}
                  >
                    {item.extend_info.name}
                  </Link>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (!item.is_status) setNotice('该资源已被下线无法查看！')
                    }}
                  >
                    {item.extend_info.name}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">暂无收藏</p>
        )}
        {notice ? <p role="status">{notice}</p> : null}
      </section>
    </aside>
  )
}
