import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HttpResponse, delay, http } from 'msw'
import { setupServer } from 'msw/node'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'

import { DiagnosticsPage } from './diagnostics-page'
import { diagnosticQueryOptions } from './query-options'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const server = setupServer()
let container: HTMLDivElement
let root: Root
let queryClient: QueryClient

beforeAll(() => server.listen())
beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  queryClient.clear()
  container.remove()
  server.resetHandlers()
})
afterAll(() => server.close())

function renderPage() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  act(() => {
    root = createRoot(container)
    root.render(
      <QueryClientProvider client={queryClient}>
        <DiagnosticsPage />
      </QueryClientProvider>,
    )
  })
}

async function waitForText(text: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (container.textContent?.includes(text)) return
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)))
  }
  throw new Error(`Expected "${text}" in:\n${container.innerHTML}`)
}

function click(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!button) throw new Error(`Missing button: ${label}`)
  act(() => button.click())
}

describe('browser-visible query diagnostics', () => {
  it('复用路由预加载后的 Query 数据，不在组件挂载时重复请求', async () => {
    let requests = 0
    server.use(
      http.get('/api/diagnostics', () => {
        requests += 1
        return HttpResponse.json({
          items: [{ id: 'cached', label: '预加载结果' }],
        })
      }),
    )
    queryClient = new QueryClient()
    await queryClient.ensureQueryData(diagnosticQueryOptions('success'))
    await act(async () => {
      root = createRoot(container)
      root.render(
        <QueryClientProvider client={queryClient}>
          <DiagnosticsPage />
        </QueryClientProvider>,
      )
    })
    await waitForText('预加载结果')
    expect(requests).toBe(1)
  })
  it('moves from loading to success and empty states', async () => {
    server.use(
      http.get('/api/diagnostics', async ({ request }) => {
        await delay(20)
        const mode = new URL(request.url).searchParams.get('mode')
        return HttpResponse.json(
          mode === 'empty'
            ? { items: [] }
            : { items: [{ id: 'mock-01', label: '统一客户端' }] },
        )
      }),
    )

    renderPage()
    expect(container.textContent).toContain('正在读取模拟响应')
    await waitForText('统一客户端')

    click('空数据')
    await waitForText('响应成功，但没有数据')
  })

  it('shows normalized HTTP, business, cancellation, and timeout outcomes', async () => {
    server.use(
      http.get('/api/diagnostics', async ({ request }) => {
        const mode = new URL(request.url).searchParams.get('mode')
        if (mode === 'http-error') {
          return HttpResponse.json(
            { error: '模拟服务暂时不可用' },
            { status: 503 },
          )
        }
        if (mode === 'business-error') {
          return HttpResponse.json({
            success: false,
            message: '模拟资源状态不允许此操作',
          })
        }
        await delay(300)
        return HttpResponse.json({ items: [{ id: 'late', label: '迟到响应' }] })
      }),
    )

    renderPage()
    click('HTTP 错误')
    await waitForText('HTTP 503 · 模拟服务暂时不可用')

    click('业务错误')
    await waitForText('业务失败 · 模拟资源状态不允许此操作')

    click('可取消请求')
    await waitForText('正在读取模拟响应')
    click('取消当前请求')
    await waitForText('请求已取消')

    click('请求超时')
    await waitForText('超时 · 请求超时')
  })
})
