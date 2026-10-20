import { afterEach, expect, it, vi } from 'vitest'
import {
  getNotices,
  getNoticeDetail,
  readAllNotices,
  getNoticeCount,
  getTodoCount,
  getTodos,
  addTodo,
  changeTodo,
  getCollections,
} from './activity'

afterEach(() => vi.unstubAllGlobals())

it('通知必须是分页对象，缺失总数或字段不以空列表冒充成功', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ results: [] })),
  )
  await expect(getNotices()).rejects.toMatchObject({ kind: 'invalid-response' })
})

it('通知筛选和分页使用服务端参数，详情仅用户打开时 GET，全部已读无请求体', async () => {
  const fetch = vi.fn(async (url: URL, options: RequestInit) => {
    expect(String(url)).toContain('/notice/?page=2&size=10&is_read=2')
    expect(options.method).toBe('GET')
    return Response.json({
      count: 12,
      results: [
        {
          id: 1,
          title: '合成通知',
          pub_time: '2026-10-20 12:00:00',
          is_read: false,
        },
      ],
    })
  })
  vi.stubGlobal('fetch', fetch)
  expect((await getNotices(2, 10, 2)).count).toBe(12)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL) => {
      expect(String(url)).toContain('/notice/a%2Fb/')
      return Response.json({
        id: 'a/b',
        title: '合成详情',
        content: '<script>文本</script>',
        pub_time: '2026-10-20 12:00:00',
      })
    }),
  )
  expect((await getNoticeDetail('a/b')).content).toBe('<script>文本</script>')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: URL, options: RequestInit) => {
      expect(options.method).toBe('POST')
      expect(options.body).toBeUndefined()
      return Response.json({ status: 1 })
    }),
  )
  await expect(readAllNotices()).resolves.toBeUndefined()
})

it('待办创建与状态提交保持 content/set_time 和单项 ids/otype 契约', async () => {
  const item = {
    id: 'todo-1',
    content: '模拟事项',
    set_time: '2026-10-20 15:00:00',
    if_finish: false,
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: URL, options: RequestInit) => {
      expect(JSON.parse(String(options.body))).toEqual({
        content: '模拟事项',
        set_time: item.set_time,
      })
      return Response.json(item)
    }),
  )
  await expect(
    addTodo({ content: '模拟事项', set_time: item.set_time }),
  ).resolves.toEqual({ id: item.id })
  for (const otype of [1, 2] as const) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL, options: RequestInit) => {
        expect(String(url)).toContain('/todo/batch/')
        expect(JSON.parse(String(options.body))).toEqual({
          ids: ['todo-1'],
          otype,
        })
        return Response.json({ status: 1 })
      }),
    )
    await expect(changeTodo('todo-1', otype)).resolves.toBeUndefined()
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 2, message: '事项已被删除' })),
  )
  await expect(changeTodo('todo-1', 1)).rejects.toMatchObject({
    kind: 'business',
    message: '事项已被删除',
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: URL, options: RequestInit) => {
      expect(JSON.parse(String(options.body))).toEqual({
        content: null,
        set_time: null,
      })
      return Response.json({ id: 'todo-empty' })
    }),
  )
  await expect(addTodo({ content: '', set_time: '' })).resolves.toEqual({
    id: 'todo-empty',
  })
})

it('三种读取保留各自响应结构，不猜数量 key 或把分页当全量', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 1, data: 5 })),
  )
  await expect(getNoticeCount()).resolves.toBe(5)
  await expect(getTodoCount()).rejects.toMatchObject({
    kind: 'invalid-response',
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 1, data: { count: 2 } })),
  )
  await expect(getTodoCount()).resolves.toBe(2)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ results: [], count: 0 })),
  )
  await expect(getTodos()).rejects.toMatchObject({ kind: 'invalid-response' })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL) => {
      expect(String(url)).toContain('/collect/?page=2&size=21&search=')
      return Response.json({
        count: 22,
        results: [
          {
            id: 22,
            attribute: 1,
            is_status: false,
            object_id: 4,
            extend_info: { name: '模拟课程' },
          },
        ],
      })
    }),
  )
  expect((await getCollections(2)).results[0]?.is_status).toBe(false)
})
