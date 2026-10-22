// @vitest-environment node
import { createServer, request } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

it('文本和图形WS升级请求转发到同一上游，保留路径和Cookie且上游认证仅在服务端补入', async () => {
  const seen: Array<{ url?: string; cookie?: string; authorization?: string }> =
    []
  const upstream = createServer()
  upstream.on('upgrade', (req, socket) => {
    seen.push({
      url: req.url,
      cookie: req.headers.cookie,
      authorization: req.headers.authorization,
    })
    const accept = createHash('sha1')
      .update(
        req.headers['sec-websocket-key'] +
          '258EAFA5-E914-47DA-95CA-C5AB0DC85B11',
      )
      .digest('base64')
    socket.end(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    )
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const address = upstream.address()
  if (!address || typeof address === 'string') throw new Error('测试端口未分配')
  vi.stubEnv('LOCAL_API_TARGET', `http://127.0.0.1:${address.port}`)
  vi.stubEnv('LOCAL_API_BASIC_AUTH', 'Basic isolated-test')
  const cacheDir = await mkdtemp(join(tmpdir(), 'xueyuan-terminal-proxy-'))
  vi.stubEnv('LOCAL_VITE_CACHE_DIR', cacheDir)
  const vite = await createViteServer({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    server: { host: '127.0.0.1', port: 0, strictPort: true },
    logLevel: 'silent',
  })
  try {
    await vite.listen()
    for (const [path, authorization] of [
      ['dockerssh/run-one/', undefined],
      ['vpcssh/node%20two/', 'Token isolated-application'],
      ['kvmvnc/run-vnc/', undefined],
      ['kvmrdp/run-rdp/', undefined],
    ] as const) {
      await new Promise<void>((resolve, reject) => {
        const req = request(
          new URL(`/ws/${path}`, vite.resolvedUrls!.local[0]!),
          {
            headers: {
              Connection: 'Upgrade',
              Upgrade: 'websocket',
              'Sec-WebSocket-Version': '13',
              'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
              Cookie: 'sessionid=isolated-test',
              ...(authorization ? { Authorization: authorization } : {}),
            },
          },
        )
        req.on('upgrade', (response, socket) => {
          socket.destroy()
          expect(response.statusCode).toBe(101)
          resolve()
        })
        req.on('response', (response) =>
          reject(new Error(`升级失败: ${response.statusCode}`)),
        )
        req.on('error', reject)
        req.end()
      })
    }
    expect(seen).toEqual([
      {
        url: '/ws/dockerssh/run-one/',
        cookie: 'sessionid=isolated-test',
        authorization: 'Basic isolated-test',
      },
      {
        url: '/ws/vpcssh/node%20two/',
        cookie: 'sessionid=isolated-test',
        authorization: 'Token isolated-application',
      },
      {
        url: '/ws/kvmvnc/run-vnc/',
        cookie: 'sessionid=isolated-test',
        authorization: 'Basic isolated-test',
      },
      {
        url: '/ws/kvmrdp/run-rdp/',
        cookie: 'sessionid=isolated-test',
        authorization: 'Basic isolated-test',
      },
    ])
  } finally {
    await vite.close()
    await rm(cacheDir, { recursive: true, force: true })
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
