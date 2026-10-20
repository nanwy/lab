import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getCurrentUser,
  getLoginBackground,
  isSessionExpired,
  login,
  logout,
} from './auth'

afterEach(() => vi.unstubAllGlobals())

describe('账号接口契约', () => {
  it('当前用户保留个人资料和未识别的 extend_info 字段，供岗位编辑往返', async () => {
    const user = {
      id: 'profile-user',
      username: 'learner',
      realname: '测试学员',
      unit: '测试单位',
      phone: '',
      email: null,
      logo: '',
      job_number: '001',
      extend_info: {
        first_entry: true,
        position: [7],
        ai_app: '',
        retained: { value: 1 },
      },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(user)),
    )
    await expect(getCurrentUser()).resolves.toEqual(user)
  })
  it('背景只读取已确认的 front_background 字段，空字符串表示未配置', async () => {
    for (const front_background of ['', '/test-background.svg']) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          Response.json({ front_background, default_photo: '/unrelated.svg' }),
        ),
      )
      await expect(getLoginBackground()).resolves.toEqual({ front_background })
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ default_photo: '/unrelated.svg' })),
    )
    await expect(getLoginBackground()).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  })
  it.each([
    ['未登录', true],
    ['您无权访问', false],
    ['未激活', false],
    ['未知错误', false],
  ])('只把 403 的 %s 分支识别为会话失效', async (error, expired) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error }, { status: 403 })),
    )
    const failure = await getCurrentUser().catch((value: unknown) => value)
    expect(isSessionExpired(failure)).toBe(expired)
  })

  it('拒绝缺少当前用户 ID 的成功响应', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({})),
    )
    await expect(getCurrentUser()).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  })

  it('保持登录请求字段和 CSRF、Token 协议，退出失败不能当成功', async () => {
    localStorage.setItem('token', 'test token')
    document.cookie = 'csrftoken=test-csrf; path=/'
    const fetch = vi.fn(async (_url: unknown, options?: RequestInit) => {
      expect(options?.method).toBe('POST')
      expect(new Headers(options?.headers).get('authorization')).toBe(
        'Token test%20token',
      )
      expect(new Headers(options?.headers).get('x-csrftoken')).toBe('test-csrf')
      expect(JSON.parse(String(options?.body))).toEqual({
        username: 'learner',
        password: 'secret',
        code: '1234',
      })
      return Response.json({ status: 1 })
    })
    vi.stubGlobal('fetch', fetch)
    try {
      await expect(
        login({ username: 'learner', password: 'secret', code: '1234' }),
      ).resolves.toEqual({ status: 1 })
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ status: 2 })),
      )
      await expect(logout()).rejects.toMatchObject({ kind: 'business' })
    } finally {
      localStorage.removeItem('token')
      document.cookie = 'csrftoken=; Max-Age=0; path=/'
    }
  })
})
