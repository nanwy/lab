import { HttpResponse, http } from 'msw'
import { appConfig } from '../config'
import type { Collection, Todo } from '../api/activity'

// MSW 内的标签页模拟服务，避免将第二份业务状态放入应用组件。
export function createActivityHandlers() {
  type Notice = {
    id: number
    title: string
    content: string
    pub_time: string
    is_read: boolean
  }
  const seedNotices: Notice[] = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    title: `模拟通知 ${index + 1}`,
    content: '这是本地模拟通知，不代表原服务数据。',
    pub_time: '2026-10-20 10:00:00',
    is_read: false,
  }))
  const seedCollections: Collection[] = Array.from(
    { length: 22 },
    (_, index) => ({
      id: index + 1,
      attribute: 1,
      is_status: index !== 0,
      object_id: `mock-course-${index + 1}`,
      extend_info: { name: `模拟收藏 ${index + 1}` },
    }),
  )
  function read<T>(key: string, initial: T): T {
    const stored = sessionStorage.getItem(`mock-activity-${key}`)
    return stored ? (JSON.parse(stored) as T) : initial
  }
  const notices = () => read('notices', seedNotices)
  const todos = () => read<Todo[]>('todos', [])
  const save = (key: string, value: unknown) =>
    sessionStorage.setItem(`mock-activity-${key}`, JSON.stringify(value))
  const url = (path: string) => `${appConfig.apiBaseUrl}/front/user/${path}`
  const allowed = (request: Request) =>
    request.headers.get('authorization') === 'Token mock-session'
  const denied = () => HttpResponse.json({ error: '未登录' }, { status: 403 })
  function paginate<T>(items: T[], request: Request) {
    const search = new URL(request.url).searchParams
    const page = Math.max(1, Number(search.get('page') ?? 1))
    const size = Math.max(1, Number(search.get('size') ?? 10))
    return HttpResponse.json({
      count: items.length,
      results: items.slice((page - 1) * size, page * size),
    })
  }
  return [
    http.get(url('notice/count/'), ({ request }) =>
      allowed(request)
        ? HttpResponse.json({
            status: 1,
            data: notices().filter((item) => !item.is_read).length,
          })
        : denied(),
    ),
    http.get(url('notice/'), ({ request }) => {
      if (!allowed(request)) return denied()
      const filter = new URL(request.url).searchParams.get('is_read')
      return paginate(
        notices().filter(
          (item) => !filter || (filter === '1' ? item.is_read : !item.is_read),
        ),
        request,
      )
    }),
    http.get(url('notice/:id/'), ({ request, params }) => {
      if (!allowed(request)) return denied()
      const item = notices().find((item) => String(item.id) === params.id)
      if (!item) return HttpResponse.json({}, { status: 404 })
      save(
        'notices',
        notices().map((notice) =>
          notice.id === item.id ? { ...notice, is_read: true } : notice,
        ),
      )
      return HttpResponse.json({ ...item, is_read: true })
    }),
    http.post(url('notice/read/'), ({ request }) => {
      if (!allowed(request)) return denied()
      save(
        'notices',
        notices().map((item) => ({ ...item, is_read: true })),
      )
      return HttpResponse.json({ status: 1 })
    }),
    http.get(url('todo/count/'), ({ request }) =>
      allowed(request)
        ? HttpResponse.json({
            status: 1,
            data: { count: todos().filter((item) => !item.if_finish).length },
          })
        : denied(),
    ),
    http.get(url('todo/'), ({ request }) =>
      allowed(request) ? HttpResponse.json(todos()) : denied(),
    ),
    http.post(url('todo/'), async ({ request }) => {
      if (!allowed(request)) return denied()
      const body = (await request.json()) as {
        content: string
        set_time: string
      }
      const item = {
        id: crypto.randomUUID(),
        content: body.content,
        set_time: body.set_time,
        if_finish: false,
      }
      save('todos', [...todos(), item])
      return HttpResponse.json(item)
    }),
    http.post(url('todo/batch/'), async ({ request }) => {
      if (!allowed(request)) return denied()
      const { ids, otype } = (await request.json()) as {
        ids: (string | number)[]
        otype: number
      }
      if (otype !== 1 && otype !== 2) return HttpResponse.json({ status: 2 })
      save(
        'todos',
        otype === 1
          ? todos().filter((item) => !ids.includes(item.id))
          : todos().map((item) =>
              ids.includes(item.id) ? { ...item, if_finish: true } : item,
            ),
      )
      return HttpResponse.json({ status: 1 })
    }),
    http.get(url('collect/'), ({ request }) => {
      if (!allowed(request)) return denied()
      if (new URL(request.url).searchParams.has('nopage'))
        return HttpResponse.json(seedCollections)
      return paginate(seedCollections, request)
    }),
  ]
}
