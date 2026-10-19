import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createAppRouter } from '../router'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root | undefined

beforeEach(() => {
  container = document.createElement('div')
  container.style.width = '1024px'
  container.style.height = '768px'
  document.body.append(container)
})

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = undefined
  container.remove()
})

async function renderTopology() {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: ['/topology'] }),
  )
  await router.load()
  await act(async () => {
    root = createRoot(container)
    root.render(<RouterProvider router={router} />)
  })
}

async function waitFor<T>(read: () => T | undefined | null): Promise<T> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const value = read()
    if (value) return value
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)))
  }
  throw new Error(`Expected DOM state was not reached:\n${container.innerHTML}`)
}

function findButton(name: string) {
  return Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === name,
  )
}

function click(element: Element) {
  element.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true }),
  )
}

describe('topology compatibility route', () => {
  it('mounts a custom node and keeps an edited label after save and reopen', async () => {
    await renderTopology()

    expect(
      await waitFor(() => container.querySelector('.react-flow')),
    ).toBeTruthy()
    expect(container.textContent).toContain('核心路由器')
    expect(container.textContent).toContain('未支持的形状 legacy-annotation')

    const selectNode = container.querySelector(
      'button[aria-label="编辑 核心路由器"]',
    )
    if (!selectNode) throw new Error('Expected custom topology node')
    await act(async () => click(selectNode))

    const labelInput = await waitFor(() =>
      container.querySelector<HTMLInputElement>('input[name="node-label"]'),
    )
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set
      setValue?.call(labelInput, '核心路由器（已校准）')
      labelInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const apply = findButton('应用名称')
    if (!apply) throw new Error('Expected apply button')
    await act(async () => click(apply))

    const save = findButton('保存并重开')
    if (!save) throw new Error('Expected save and reopen button')
    await act(async () => click(save))

    expect(container.textContent).toContain('核心路由器（已校准）')
    expect(container.textContent).toContain('已从 X6 格式重新打开')
  })
})
