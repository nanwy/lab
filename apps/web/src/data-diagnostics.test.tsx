import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

import { DataDiagnosticsPage } from './data-diagnostics'
import { createSampleHandlers } from './mocks/sample-handlers'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const server = setupServer()
let container: HTMLDivElement
let root: Root
let client: QueryClient
beforeAll(() => server.listen())
beforeEach(() => {
  server.use(...createSampleHandlers())
  container = document.createElement('div')
  document.body.append(container)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  act(() => {
    root = createRoot(container)
    root.render(
      <QueryClientProvider client={client}>
        <DataDiagnosticsPage />
      </QueryClientProvider>,
    )
  })
})
afterEach(async () => {
  await act(async () => root?.unmount())
  client?.clear()
  container?.remove()
  server.resetHandlers()
})
afterAll(() => server.close())

async function text(value: string) {
  for (let i = 0; i < 100; i++) {
    if (container.textContent?.includes(value)) return
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)))
  }
  throw new Error(`Missing ${value}: ${container.textContent}`)
}
function click(value: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === value,
  )
  if (!button) throw new Error(`Missing button ${value}`)
  act(() => button.click())
}
function input(label: string, value: string) {
  const field = Array.from(container.querySelectorAll('input')).find(
    (input) =>
      input.getAttribute('aria-label') === label ||
      Array.from(input.labels ?? []).some(
        (item) => item.textContent?.trim() === label,
      ),
  )
  if (!field) throw new Error(`Missing input ${label}`)
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

it('pages and sorts the complete mock collection, filters at the server and selects stable row IDs', async () => {
  await text('样本 01')
  expect(container.textContent).not.toContain('样本 06')
  click('下一页')
  await text('样本 06')
  click('名称 ↑')
  await text('样本 12')
  expect(container.textContent).not.toContain('样本 06')
  const select = container.querySelector<HTMLInputElement>(
    'input[aria-label="选择 sample-12"]',
  )!
  act(() => select.click())
  await text('已选 1 项')
  input('筛选样本名称', '样本 02')
  await text('共 1 项')
  expect(container.querySelector('tbody')?.textContent).toContain('样本 02')
  expect(container.querySelector('tbody')?.textContent).not.toContain('样本 12')
})

it('validates nested dynamic fields, attaches server errors, saves and refreshes the visible list', async () => {
  await text('样本 01')
  click('编辑 sample-01')
  input('样本名称', 'x')
  click('保存模拟样本')
  await text('名称至少 2 个字符')
  input('样本名称', '保留名称')
  click('添加别名')
  click('保存模拟样本')
  await text('别名不能为空')
  input('别名 2', '新的嵌套别名')
  click('保存模拟样本')
  await text('该名称由模拟服务保留，请换一个名称')
  input('样本名称', '样本 00 已更新')
  click('保存模拟样本')
  await text('模拟保存成功，列表已刷新')
  expect(container.querySelector('tbody')?.textContent).toContain(
    '样本 00 已更新',
  )
  expect(container.querySelector('tbody')?.textContent).toContain(
    '新的嵌套别名',
  )
  click('重置模拟样本')
  await text('样本 01')
  expect(container.querySelector('tbody')?.textContent).not.toContain('已更新')
})
