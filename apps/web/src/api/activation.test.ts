import { afterEach, expect, it, vi } from 'vitest'
import {
  activateOffline,
  activateOnline,
  getActivationStatus,
} from './activation'

afterEach(() => vi.unstubAllGlobals())

it('在线 JSON 与本地 multipart 激活保持原站字段，区分激活失败与成功', async () => {
  const fetch = vi.fn(async (url: unknown, options?: RequestInit) => {
    if (String(url).endsWith('/status/'))
      return Response.json({
        status: 0,
        url: 'https://license.test',
        device_id: 'local-device',
        expire_time: '',
      })
    if (String(url).endsWith('/online/')) {
      expect(JSON.parse(String(options?.body))).toEqual({
        url: 'https://license.test',
        activate_code: 'sample',
        code: '2468',
      })
      return Response.json({ status: 2, message: 'private service detail' })
    }
    expect(String(url)).toMatch(/\/offline\/$/)
    expect(options?.body).toBeInstanceOf(FormData)
    const body = options?.body as FormData
    expect(body.get('activate_code')).toBe('sample')
    expect((body.get('file') as File).name).toBe('license.lic')
    expect(new Headers(options?.headers).has('content-type')).toBe(false)
    return Response.json({ status: 1 })
  })
  vi.stubGlobal('fetch', fetch)
  await expect(getActivationStatus()).resolves.toMatchObject({
    status: 0,
    device_id: 'local-device',
  })
  await expect(
    activateOnline({
      url: 'https://license.test',
      activate_code: 'sample',
      code: '2468',
    }),
  ).resolves.toEqual({ status: 2 })
  await expect(
    activateOffline('sample', new File(['test'], 'license.lic')),
  ).resolves.toEqual({ status: 1 })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 9 })),
  )
  await expect(getActivationStatus()).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})
