import { afterEach, expect, it, vi } from 'vitest'
import { toast } from '@workspace/ui/components/sonner'
import { apiClient } from './index'
import { queryClient } from '../query-client'
import { isSessionExpired, logout } from './auth'

vi.mock('@workspace/ui/components/sonner', () => ({
  toast: { error: vi.fn() },
}))

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  queryClient.clear()
  localStorage.removeItem('token')
})

it.each([
  [
    'http',
    () => Response.json({ error: '账号或密码错误!' }, { status: 400 }),
    '账号或密码错误!',
  ],
  [
    'business',
    () => Response.json({ status: 2, message: '实验已锁定' }),
    '实验已锁定',
  ],
  ['invalid-response', () => new Response('{'), '响应不是有效的 JSON'],
  [
    'network',
    () => {
      throw new TypeError('private transport detail')
    },
    '网络请求失败',
  ],
] as const)(
  '实际请求实例直接提示 %s 错误并继续抛出',
  async (kind, response, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response()),
    )
    await expect(
      apiClient.request('/operation', {
        isBusinessFailure: (value) =>
          typeof value === 'object' &&
          value !== null &&
          Reflect.get(value, 'status') === 2,
      }),
    ).rejects.toMatchObject({ kind, message, handled: true })
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(message)
  },
)

it.each([
  ['未登录', '#/login?reason=expired', true],
  ['您无权访问', '#/forbidden', false],
  ['未激活', '#/activate', false],
] as const)(
  '请求实例统一处理 %s 的跳转和会话，不额外弹 toast',
  async (error, destination, expired) => {
    const replace = vi.fn()
    vi.stubGlobal('location', { origin: 'http://localhost', replace })
    localStorage.setItem('token', 'fixture-token')
    queryClient.setQueryData(['permission-probe'], 'cached')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error }, { status: 403 })),
    )
    await expect(apiClient.request('/protected')).rejects.toMatchObject({
      status: 403,
      handled: true,
    })
    expect(toast.error).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledExactlyOnceWith(destination)
    expect(localStorage.getItem('token')).toBe(expired ? null : 'fixture-token')
    expect(queryClient.getQueryData(['permission-probe'])).toBe(
      expired ? undefined : 'cached',
    )
  },
)

it('普通 403 原样提示 error，不清会话或跳转', async () => {
  const replace = vi.fn()
  vi.stubGlobal('location', { origin: 'http://localhost', replace })
  localStorage.setItem('token', 'fixture-token')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ error: '操作暂不可用' }, { status: 403 }),
    ),
  )
  await expect(apiClient.request('/ordinary-forbidden')).rejects.toMatchObject({
    message: '操作暂不可用',
    handled: true,
  })
  expect(toast.error).toHaveBeenCalledExactlyOnceWith('操作暂不可用')
  expect(replace).not.toHaveBeenCalled()
  expect(localStorage.getItem('token')).toBe('fixture-token')
})

it('改密后退出允许会话失效，由业务流程收尾，不触发全局失效跳转', async () => {
  const replace = vi.fn()
  vi.stubGlobal('location', { origin: 'http://localhost', replace })
  localStorage.setItem('token', 'fixture-token')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ error: '未登录' }, { status: 403 })),
  )
  const error: unknown = await logout(undefined, true).catch(
    (error: unknown) => error,
  )
  expect(isSessionExpired(error)).toBe(true)
  expect(replace).not.toHaveBeenCalled()
  expect(toast.error).not.toHaveBeenCalled()
  expect(localStorage.getItem('token')).toBe('fixture-token')
})

it('主动取消不弹 toast', async () => {
  const controller = new AbortController()
  controller.abort()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw controller.signal.reason
    }),
  )
  await expect(
    apiClient.request('/cancelled', { signal: controller.signal }),
  ).rejects.toMatchObject({ kind: 'cancelled', handled: true })
  expect(toast.error).not.toHaveBeenCalled()
})
