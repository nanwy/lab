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
