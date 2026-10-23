import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'
import { createServer, type ServerResponse } from 'node:http'
let pending: ServerResponse | undefined
let received = ''
let receivedHeaders: import('node:http').IncomingHttpHeaders = {}
const server = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4193')
  response.setHeader(
    'Access-Control-Allow-Headers',
    'authorization,x-csrftoken',
  )
  if (request.method === 'OPTIONS') {
    response.end()
    return
  }
  if (
    ![
      '/upload-boundary',
      '/api/front/learn/task/my_profile/files/upload/',
      '/body-late',
    ].includes(request.url ?? '')
  ) {
    response.writeHead(404)
    response.end()
    return
  }
  const chunks: Buffer[] = []
  request.on('data', (chunk) => chunks.push(chunk))
  request.on('end', () => {
    received = Buffer.concat(chunks).toString()
    receivedHeaders = request.headers
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/body-late') {
      response.write('{')
      setTimeout(() => response.end('}'), 200)
      return
    }
    if (request.url === '/upload-boundary')
      response.end(JSON.stringify({ message: '上传成功' }))
    else pending = response
  })
})
test.beforeAll(async () => {
  await new Promise<void>((resolve) =>
    server.listen(4293, '127.0.0.1', resolve),
  )
})
test.afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

test('真实传输报告字节进度并保留统一请求策略及多文件表单', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const modulePath = '/src/api/client.ts'
    const { createApiClient } = await import(/* @vite-ignore */ modulePath)
    const progress: { loaded: number; total: number }[] = []
    const form = new FormData()
    form.append('parent_path', '/资料 & #')
    form.append('attached', new File(['a'.repeat(100000)], 'a.txt'))
    form.append('attached', new File(['bb'], 'b.txt'))
    const client = createApiClient({
      baseUrl: 'http://127.0.0.1:4293',
      requestPolicy: {
        apply({ headers }: { headers: Headers }) {
          headers.set('x-csrftoken', 'csrf-fixture')
          headers.set('authorization', 'Token encoded-fixture')
        },
      },
    })
    const value = await client.request('/upload-boundary', {
      method: 'POST',
      body: form,
      onUploadProgress: (event: { loaded: number; total: number }) =>
        progress.push(event),
    })
    return { value, progress }
  })
  expect(receivedHeaders['x-csrftoken']).toBe('csrf-fixture')
  expect(receivedHeaders.authorization).toBe('Token encoded-fixture')
  expect(received).toContain('/资料 & #')
  expect(received).toContain('filename="a.txt"')
  expect(received).toContain('filename="b.txt"')
  expect(result.value).toEqual({ message: '上传成功' })
  expect(result.progress.length).toBeGreaterThan(0)
  expect(result.progress.at(-1)!.loaded).toBeGreaterThan(100002)
  expect(result.progress.at(-1)!.loaded).toBe(result.progress.at(-1)!.total)
})

async function mountUpload(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.evaluate(
    async (path) => {
      const { mount } = await import(/* @vite-ignore */ path)
      mount()
    },
    '/@fs' + resolve('tests/modes/s09-upload-harness.tsx'),
  )
}
test('多个文件上传等待响应最多99%，成功100%并刷新提交目录', async ({
  page,
}) => {
  await page
    .context()
    .addCookies([
      {
        name: 'csrftoken',
        value: 'csrf-upload-fixture',
        url: 'http://127.0.0.1:4193',
      },
    ])
  await page.addInitScript(() => localStorage.setItem('token', '上传 & #'))
  await mountUpload(page)
  await page.getByLabel('选择上传文件').setInputFiles([
    { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
    { name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('world') },
  ])
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '99',
  )
  await expect(page.getByText('正在等待服务确认')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('upload-waiting.png') })
  expect(receivedHeaders.authorization).toBe(
    'Token %E4%B8%8A%E4%BC%A0%20%26%20%23',
  )
  expect(receivedHeaders['x-csrftoken']).toBe('csrf-upload-fixture')
  expect(received).toContain('/资料')
  pending!.end(JSON.stringify({ message: '上传成功' }))
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '100',
  )
  await expect(page.locator('.file-drive')).toHaveAttribute(
    'data-refreshed',
    'yes',
  )
})

test('统一上传管线区分HTTP、业务失败、预取消、超时，错误回调只调用一次', async ({
  page,
}) => {
  await page.route('**/contract-http', (r) =>
    r.fulfill({ status: 422, json: { error: '文件不可用' } }),
  )
  await page.route('**/contract-business', (r) =>
    r.fulfill({ json: { success: false, message: '服务拒绝' } }),
  )
  await page.route('**/contract-slow', async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 150))
    await r.fulfill({ json: { message: 'late' } })
  })
  await page.goto('/')
  const results = await page.evaluate(async () => {
    const path = '/src/api/client.ts'
    const { createApiClient } = await import(/* @vite-ignore */ path)
    const records = []
    for (const mode of [
      'http',
      'business',
      'pre-cancelled',
      'timeout',
      'cancelled',
    ]) {
      const errors: string[] = []
      const client = createApiClient({
        baseUrl: location.origin,
        onError(error: { kind: string }) {
          errors.push(error.kind)
        },
      })
      const abort = new AbortController()
      if (mode === 'pre-cancelled') abort.abort()
      const request = client.request(
        '/contract-' + (mode === 'http' || mode === 'business' ? mode : 'slow'),
        {
          method: 'POST',
          body: new FormData(),
          signal: abort.signal,
          timeoutMs: mode === 'timeout' ? 20 : undefined,
          onUploadProgress() {
            if (mode === 'cancelled') abort.abort()
          },
          isBusinessFailure: (value: { success?: boolean }) =>
            value?.success === false,
        },
      )
      if (mode === 'cancelled') setTimeout(() => abort.abort(), 20)
      const failure = await request.catch(
        (error: { kind: string; message: string }) => ({
          kind: error.kind,
          message: error.message,
        }),
      )
      records.push({ mode, failure, errors })
    }
    return records
  })
  expect(results.map((r) => r.errors)).toEqual([
    ['http'],
    ['business'],
    ['cancelled'],
    ['timeout'],
    ['cancelled'],
  ])
  expect(results[0]!.failure.message).toBe('文件不可用')
  expect(results[1]!.failure.message).toBe('服务拒绝')
})

test('取消与失败后可重新选择，服务失败不刷新目录', async ({ page }) => {
  await mountUpload(page)
  const picker = page.getByLabel('选择上传文件')
  const file = {
    name: 'retry.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('retry'),
  }
  await picker.setInputFiles(file)
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '99',
  )
  await page.getByRole('button', { name: '取消上传', exact: true }).click()
  await expect(page.getByText('已取消上传', { exact: true })).toBeVisible()
  await expect(picker).toBeEnabled()
  await picker.setInputFiles(file)
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '99',
  )
  await expect.poll(() => pending?.destroyed).toBe(false)
  pending!.writeHead(422)
  pending!.end(JSON.stringify({ error: '文件不可用' }))
  await expect(page.getByText('上传未完成', { exact: true })).toBeVisible()
  await expect(picker).toBeEnabled()
  await expect(page.locator('.file-drive')).not.toHaveAttribute(
    'data-refreshed',
    'yes',
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: test.info().outputPath('upload-error-mobile.png'),
  })
  await picker.setInputFiles(file)
  await expect(page.getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '99',
  )
  await page.screenshot({ path: test.info().outputPath('upload-mobile.png') })
  await page.evaluate(
    async (path) => {
      const { changeDirectory } = await import(/* @vite-ignore */ path)
      changeDirectory('/其他')
    },
    '/@fs' + resolve('tests/modes/s09-upload-harness.tsx'),
  )
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.locator('.file-drive')).not.toHaveAttribute(
    'data-refreshed',
    'yes',
  )
})

test('响应头已到达但正文未完成时取消，不能产生迟到成功', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const path = '/src/api/client.ts'
    const { createApiClient } = await import(/* @vite-ignore */ path)
    const abort = new AbortController()
    const errors: string[] = []
    const client = createApiClient({
      baseUrl: 'http://127.0.0.1:4293',
      onError(error: { kind: string }) {
        errors.push(error.kind)
      },
    })
    const request = client.request('/body-late', {
      method: 'POST',
      body: new FormData(),
      onUploadProgress() {},
      signal: abort.signal,
    })
    setTimeout(() => abort.abort(), 50)
    const result = await request.catch((error: { kind: string }) => error.kind)
    return { result, errors }
  })
  expect(result).toEqual({ result: 'cancelled', errors: ['cancelled'] })
})
