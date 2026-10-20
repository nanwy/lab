import { afterEach, expect, it, vi } from 'vitest'
import {
  changePassword,
  getPersonalStatistics,
  saveProfile,
  uploadAvatar,
} from './auth'

afterEach(() => vi.unstubAllGlobals())

it.each([
  ['realname', 20],
  ['unit', 32],
  ['phone', 11],
  ['email', 100],
] as const)('资料 %s 超长在发送前被拒绝', async (name, limit) => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await expect(
    saveProfile(
      {
        realname: '',
        unit: '',
        phone: '',
        email: '',
        position: [],
        [name]: 'x'.repeat(limit + 1),
      },
      {},
    ),
  ).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
})

it('资料 PATCH 仅发送已确认字段，扩展字段往返保留', async () => {
  const values = {
    realname: '模拟姓名',
    unit: '',
    phone: '',
    email: '',
    position: [7, '8'],
  }
  const extend = { first_entry: true, retained: { nested: 1 } }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      expect(String(url)).toContain('/front/user/info/')
      expect(options.method).toBe('PATCH')
      expect(JSON.parse(String(options.body))).toEqual({
        realname: values.realname,
        unit: '',
        phone: '',
        email: '',
        extend_info: { ...extend, position: [7, '8'] },
      })
      return Response.json({ id: 'fixture', ...values, extend_info: extend })
    }),
  )
  await expect(saveProfile(values, extend)).resolves.toMatchObject({
    id: 'fixture',
    extend_info: extend,
  })
})

it('头像使用 logo multipart，不手工指定 JSON 类型；无效文件不发请求', async () => {
  const file = new File(['fixture'], 'avatar.png', { type: 'image/png' })
  const fetch = vi.fn(async (_url: string, options: RequestInit) => {
    expect(options.method).toBe('PATCH')
    expect(new Headers(options.headers).get('content-type')).toBeNull()
    const body = options.body as FormData
    expect([...body.keys()]).toEqual(['logo'])
    expect((body.get('logo') as File).name).toBe('avatar.png')
    return Response.json({ id: 'fixture', logo: '/avatar.png' })
  })
  vi.stubGlobal('fetch', fetch)
  await expect(uploadAvatar(file)).resolves.toMatchObject({
    logo: '/avatar.png',
  })
  await expect(
    uploadAvatar(new File(['x'], 'bad.gif', { type: 'image/gif' })),
  ).rejects.toThrow()
  await expect(
    uploadAvatar(
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', {
        type: 'image/png',
      }),
    ),
  ).rejects.toThrow()
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('改密发送扁平字段；业务失败和陌生错误不会被当成功或泄露', async () => {
  const values = {
    cipher: 'old-fixture',
    password: 'new-fixture',
    confirm_password: 'new-fixture',
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, options: RequestInit) => {
      expect(options.method).toBe('POST')
      expect(JSON.parse(String(options.body))).toEqual(values)
      return Response.json({ status: 1 })
    }),
  )
  await expect(changePassword(values)).resolves.toEqual({ status: 1 })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 2 })),
  )
  await expect(changePassword(values)).rejects.toMatchObject({
    kind: 'business',
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ cipher: '原密码错误' }, { status: 400 })),
  )
  await expect(changePassword(values)).rejects.toMatchObject({
    fieldErrors: { cipher: '原密码错误' },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ cipher: 'private-fixture-secret' }, { status: 400 }),
    ),
  )
  const error = await changePassword(values).catch((error: unknown) => error)
  expect(JSON.stringify(error)).not.toContain('private-fixture-secret')
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  await expect(
    changePassword({ ...values, confirm_password: 'different' }),
  ).rejects.toThrow()
  await expect(changePassword({ ...values, cipher: '' })).rejects.toThrow()
  await expect(
    changePassword({ ...values, password: 'x'.repeat(101) }),
  ).rejects.toThrow()
  expect(fetch).not.toHaveBeenCalled()
})

it('统计接受已确认数值字段，拒绝缺失字段或非成功响应', async () => {
  const data = {
    login_day: 1,
    study_length: '2小时',
    finished_course: 3,
    finished_subject_scene: 4,
    finished_assessment: 0,
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 1, data })),
  )
  await expect(getPersonalStatistics()).resolves.toEqual(data)
  for (const result of [
    { status: 2, data },
    { status: 1, data: {} },
  ]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(result)),
    )
    await expect(getPersonalStatistics()).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  }
})
