import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@workspace/ui/components/button'
import { getHomeCollections } from '../api/portal'
import { dateKey, TodoCalendar } from '../activity/TodoCalendar'
import { todosOptions } from '../activity/queries'
import NiceModal from '@ebay/nice-modal-react'
import { TodosModal } from '../activity/TodosModal'

export function HomePersonalSummary() {
  const todos = useQuery(todosOptions)
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
        <Button
          variant="outline"
          onClick={() => {
            void NiceModal.show(TodosModal)
          }}
        >
          管理待办
        </Button>
        <TodoCalendar
          todos={todos.data ?? []}
          date={date}
          setDate={setDate}
          mode={mode}
          setMode={setMode}
          selectMonth={(value) => {
            setDate(value)
            setMode('month')
          }}
        />
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
            to="/basic/personal/$type"
            params={{ type: 'enshrine' }}
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
