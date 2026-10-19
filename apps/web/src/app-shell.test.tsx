import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createAppRouter } from './router'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root | undefined

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount())
    root = undefined
  }
  container.remove()
})

async function renderAt(href: string) {
  const router = createAppRouter(
    createMemoryHistory({
      initialEntries: [href],
    }),
  )

  await router.load()
  await act(async () => {
    root = createRoot(container)
    root.render(<RouterProvider router={router} />)
  })
  return router
}

async function waitFor<T>(read: () => T | undefined | null): Promise<T> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = read()
    if (result) return result
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)))
  }
  throw new Error(`Expected DOM state was not reached:\n${container.innerHTML}`)
}

function findByText(selector: string, text: string) {
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).find(
    (element) => element.textContent?.trim() === text,
  )
}

function click(element: Element) {
  element.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true }),
  )
}

describe('application shell navigation', () => {
  it('shows only the entries granted by the mock identity capabilities', async () => {
    await renderAt('/overview')

    expect(findByText('h1', '工程概览')).toBeTruthy()
    expect(findByText('span', '林晓')).toBeTruthy()
    expect(findByText('a', '资源样例')).toBeTruthy()
    expect(findByText('a', '诊断工具')).toBeUndefined()
  })

  it('restores a typed resource deep link and its search state', async () => {
    await renderAt('/resources/lab-101?tab=activity')

    expect(findByText('h1', '资源 lab-101')).toBeTruthy()
    expect(findByText('p', '当前视图：活动记录')).toBeTruthy()
  })

  it('renders dedicated route errors and unknown-route guidance', async () => {
    await renderAt('/diagnostics/error')
    expect(findByText('h1', '页面暂时无法显示')).toBeTruthy()

    await act(async () => root?.unmount())
    root = undefined
    container.replaceChildren()

    await renderAt('/missing')
    expect(findByText('h1', '没有找到这个入口')).toBeTruthy()
  })

  it('lets users resolve navigation away from unsaved work', async () => {
    await renderAt('/draft')
    expect(findByText('h1', '导航阻止示例')).toBeTruthy()

    const textarea = container.querySelector('textarea')
    if (!textarea) throw new Error('Expected draft textarea')
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )?.set
      setValue?.call(textarea, '尚未保存的修改')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const homeLink = findByText('a', '返回概览')
    if (!homeLink) throw new Error('Expected overview link')
    await act(async () => click(homeLink))

    const dialog = await waitFor(() =>
      container.querySelector('[role="alertdialog"]'),
    )
    expect(dialog).toBeTruthy()

    const leaveButton = findByText('button', '继续离开')
    if (!leaveButton) throw new Error('Expected leave button')
    await act(async () => click(leaveButton))
    expect(await waitFor(() => findByText('h1', '工程概览'))).toBeTruthy()
  })
})
