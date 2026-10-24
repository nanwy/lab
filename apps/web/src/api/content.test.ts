import { afterEach, expect, it, vi } from 'vitest'
import { uploadContentImage } from './content'
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})
it('图片按 Ys 协议上传，携带 CSRF 但不携带 Ae Token，只消费 data.url', async () => {
  localStorage.setItem('token', 'secret')
  document.cookie = 'csrftoken=csrf'
  vi.stubGlobal('fetch', async (url: URL, options: RequestInit) => {
    expect(url.pathname).toBe('/api/front/upload_image/')
    const headers = new Headers(options.headers)
    expect(headers.get('authorization')).toBeNull()
    expect(headers.get('x-csrftoken')).toBe('csrf')
    const body = options.body as FormData
    expect(body.get('mode')).toBe('scene')
    expect(body.has('uuid')).toBe(false)
    expect((body.get('image') as File).name).toBe('diagram.png')
    return Response.json({ data: { url: '/uploads/diagram.png' } })
  })
  await expect(
    uploadContentImage(
      new File(['image'], 'diagram.png', { type: 'image/png' }),
      { mode: 'scene' },
    ),
  ).resolves.toBe('/uploads/diagram.png')
})
it('调用者提供 uuid 时保留归属，猜测的url字段与危险地址不构成上传成功', async () => {
  vi.stubGlobal('fetch', async (_url: URL, options: RequestInit) => {
    expect((options.body as FormData).get('uuid')).toBe('note-9')
    return Response.json({ url: '/wrong.png' })
  })
  await expect(
    uploadContentImage(new File(['image'], 'a.png'), {
      mode: 'note',
      uuid: 'note-9',
    }),
  ).rejects.toMatchObject({ kind: 'invalid-response' })
  vi.stubGlobal('fetch', async () =>
    Response.json({ data: { url: 'javascript:alert(1)' } }),
  )
  await expect(
    uploadContentImage(new File(['image'], 'a.png'), { mode: 'scene' }),
  ).rejects.toMatchObject({ kind: 'invalid-response' })
})

it('图片端点HTTP失败读取唯一image说明，由统一客户端处理一次', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json(
      { image: '图片格式不支持', error: '其他协议字段' },
      { status: 400 },
    ),
  )
  await expect(
    uploadContentImage(new File(['bad'], 'a.png'), { mode: 'scene' }),
  ).rejects.toMatchObject({
    kind: 'http',
    message: '图片格式不支持',
    handled: true,
  })
})
