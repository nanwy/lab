// @vitest-environment node

import { HttpResponse, delay, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { createApiClient } from './client'

const server = setupServer()

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('request contract', () => {
  it('keeps the HTTP fallback when an error body contains malformed JSON', async () => {
    const client = createApiClient({
      baseUrl: 'http://localhost/api',
      fetch: async () => new Response('{', {
        status: 502,
        headers: { 'content-type': 'application/json' },
      }),
    })
    await expect(client.request('/malformed-error')).rejects.toMatchObject({
      kind: 'http',
      status: 502,
      message: '请求失败（502）',
    })
  })

  it.each(['timeout', 'cancelled'] as const)('preserves %s while consuming an HTTP error body', async (kind) => {
    const controller = new AbortController()
    const client = createApiClient({
      baseUrl: 'http://localhost/api',
      fetch: async (_url, init) => new Response(new ReadableStream({
        start(stream) {
          init?.signal?.addEventListener('abort', () => stream.error(init.signal?.reason))
          if (kind === 'cancelled') queueMicrotask(() => controller.abort())
        },
      }), { status: 503, headers: { 'content-type': 'application/json' } }),
    })
    await expect(client.request('/error-body', { signal: controller.signal, timeoutMs: 10 })).rejects.toMatchObject({ kind })
  })

  it('keeps timeout active while consuming a response body', async () => {
    const client = createApiClient({
      baseUrl: 'http://localhost/api',
      fetch: async (_url, init) => new Response(new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason))
        },
      })),
    })

    await expect(client.request('/slow-body', { timeoutMs: 5 })).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('merges caller and policy headers for JSON requests', async () => {
    server.use(
      http.post('http://localhost/api/echo', async ({ request }) => {
        expect(request.headers.get('content-type')).toBe('application/json')
        expect(request.headers.get('x-screen')).toBe('diagnostics')
        expect(request.headers.get('x-test-csrf')).toBe('verified-at-boundary')
        expect(await request.json()).toEqual({ mode: 'success' })
        return HttpResponse.json({ id: 'request-01' })
      }),
    )

    const client = createApiClient({
      baseUrl: 'http://localhost/api',
      requestPolicy: {
        apply({ headers }) {
          headers.set('x-test-csrf', 'verified-at-boundary')
        },
      },
    })

    await expect(
      client.request<{ id: string }>('/echo', {
        method: 'POST',
        headers: new Headers({ 'x-screen': 'diagnostics' }),
        json: { mode: 'success' },
      }),
    ).resolves.toEqual({ id: 'request-01' })
  })

  it('leaves multipart boundaries to the runtime for FormData', async () => {
    server.use(
      http.post('http://localhost/api/upload', async ({ request }) => {
        expect(request.headers.get('content-type')).toMatch(
          /^multipart\/form-data; boundary=/,
        )
        expect((await request.formData()).get('label')).toBe('sample')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const form = new FormData()
    form.set('label', 'sample')
    const client = createApiClient({ baseUrl: 'http://localhost/api' })

    await expect(
      client.request<void>('/upload', {
        method: 'POST',
        body: form,
        response: 'empty',
      }),
    ).resolves.toBeUndefined()
  })

  it('normalizes HTTP and business failures without exposing raw details', async () => {
    server.use(
      http.get('http://localhost/api/http-error', () =>
        HttpResponse.json(
          {
            message: '请求参数无效',
            fieldErrors: { name: '名称不能为空', attempts: 3 },
            token: 'must-not-leak',
          },
          { status: 422 },
        ),
      ),
      http.get('http://localhost/api/business-error', () =>
        HttpResponse.json({
          success: false,
          message: '资源状态不允许此操作',
          fieldErrors: { state: '资源已锁定' },
        }),
      ),
    )
    const client = createApiClient({ baseUrl: 'http://localhost/api' })

    const httpFailure = await client.request('/http-error').catch((error) => error)
    expect(httpFailure).toMatchObject({
      name: 'ApiError',
      kind: 'http',
      status: 422,
      message: '请求参数无效',
      fieldErrors: { name: '名称不能为空' },
    })
    expect(JSON.stringify(httpFailure)).not.toContain('must-not-leak')

    await expect(client.request('/business-error')).rejects.toMatchObject({
      kind: 'business',
      status: 200,
      message: '资源状态不允许此操作',
      fieldErrors: { state: '资源已锁定' },
    })
  })

  it('distinguishes caller cancellation from request timeout', async () => {
    server.use(
      http.get('http://localhost/api/slow', async () => {
        await delay(100)
        return HttpResponse.json({ value: 'late' })
      }),
    )
    const client = createApiClient({ baseUrl: 'http://localhost/api' })
    const controller = new AbortController()
    const cancelled = client.request('/slow', { signal: controller.signal })
    controller.abort()

    await expect(cancelled).rejects.toMatchObject({ kind: 'cancelled' })
    await expect(
      client.request('/slow', { timeoutMs: 5 }),
    ).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('supports JSON empty, text, blob, and stream response boundaries', async () => {
    server.use(
      http.get('http://localhost/api/empty-json', () =>
        new HttpResponse(null, { status: 204 }),
      ),
      http.get('http://localhost/api/text', () => HttpResponse.text('plain text')),
      http.get(
        'http://localhost/api/blob',
        () => new HttpResponse('download', { headers: { 'content-type': 'text/plain' } }),
      ),
      http.get('http://localhost/api/stream', () => HttpResponse.text('streamed')),
    )
    const client = createApiClient({ baseUrl: 'http://localhost/api' })

    await expect(client.request('/empty-json')).resolves.toBeNull()
    await expect(
      client.request('/text', { response: 'text' }),
    ).resolves.toBe('plain text')
    const blob = await client.request<Blob>('/blob', { response: 'blob' })
    expect(await blob.text()).toBe('download')
    const stream = await client.request<ReadableStream<Uint8Array>>('/stream', {
      response: 'stream',
    })
    expect(await new Response(stream).text()).toBe('streamed')
  })
})
