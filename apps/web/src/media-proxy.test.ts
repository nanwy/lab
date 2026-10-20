// @vitest-environment node
import { createServer as createHttpServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

it('本地媒体请求取得上游图片而非HTML，并仅在服务端补上游认证', async () => {
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1kAAAAASUVORK5CYII=',
    'base64',
  )
  const upstream = createHttpServer((request, response) => {
    if (request.url === '/api/auth-check/') {
      response.end(request.headers.authorization)
      return
    }
    if (request.headers.authorization !== 'Basic isolated-test') {
      response.writeHead(401).end()
      return
    }
    if (request.url === '/media/base/node/default/icon.png?version=1') {
      response.writeHead(200, { 'Content-Type': 'image/png' }).end(image)
      return
    }
    response.writeHead(404).end()
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const address = upstream.address()
  if (!address || typeof address === 'string') throw new Error('测试端口未分配')
  vi.stubEnv('LOCAL_API_TARGET', `http://127.0.0.1:${address.port}`)
  vi.stubEnv('LOCAL_API_BASIC_AUTH', 'Basic isolated-test')
  const cacheDir = await mkdtemp(join(tmpdir(), 'xueyuan-media-proxy-test-'))
  vi.stubEnv('LOCAL_VITE_CACHE_DIR', cacheDir)
  const vite = await createViteServer({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    server: { host: '127.0.0.1', port: 0, strictPort: true },
    logLevel: 'silent',
  })
  try {
    await vite.listen()
    const baseUrl = vite.resolvedUrls!.local[0]!
    const result = await fetch(
      `${baseUrl}media/base/node/default/icon.png?version=1`,
    )
    expect(result.status).toBe(200)
    expect(result.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await result.arrayBuffer())).toEqual(image)
    const missing = await fetch(`${baseUrl}media/missing.png`)
    expect(missing.status).toBe(404)
    const api = await fetch(`${baseUrl}api/auth-check/`, {
      headers: { Authorization: 'Token application-test' },
    })
    expect(await api.text()).toBe('Token application-test')
  } finally {
    await vite.close()
    await rm(cacheDir, { recursive: true, force: true })
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
