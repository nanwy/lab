import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LoadingButton,
  type LoadingButtonProps,
} from '@workspace/ui/components/loading-button'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function render(props: LoadingButtonProps) {
  await act(async () =>
    root.render(<LoadingButton {...props}>保存</LoadingButton>),
  )
  return container.querySelector('button')!
}

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('LoadingButton', () => {
  it('同步点击保持普通按钮行为，并默认不提交表单', async () => {
    const onClick = vi.fn()
    const button = await render({ onClick, variant: 'outline' })
    await act(async () => button.click())
    expect(onClick).toHaveBeenCalledOnce()
    expect(button.type).toBe('button')
    expect(button.disabled).toBe(false)
    expect(button.hasAttribute('aria-busy')).toBe(false)
  })

  it('Promise 未完成时显示 loading 并禁用按钮，完成后恢复', async () => {
    const action = deferred()
    const onClick = vi.fn(() => action.promise)
    const button = await render({ onClick })
    await act(async () => button.click())
    expect(button.disabled).toBe(true)
    await act(async () => button.click())
    expect(onClick).toHaveBeenCalledOnce()
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.querySelector('svg')).not.toBeNull()
    expect(button.textContent).toBe('保存')
    await act(async () => action.resolve())
    expect(button.disabled).toBe(false)
    expect(button.hasAttribute('aria-busy')).toBe(false)
    expect(button.querySelector('svg')).toBeNull()
  })

  it.each([true, false])(
    'Promise 拒绝时恢复按钮且不吞掉错误（提供 onError=%s）',
    async (handled) => {
      const action = deferred()
      const onError = vi.fn()
      const reportError = vi.fn()
      vi.stubGlobal('reportError', reportError)
      const button = await render({
        onClick: () => action.promise,
        onError: handled ? onError : undefined,
      })
      await act(async () => button.click())
      const error = new Error('action failed')
      await act(async () => action.reject(error))
      expect(button.disabled).toBe(false)
      expect(button.hasAttribute('aria-busy')).toBe(false)
      expect(handled ? onError : reportError).toHaveBeenCalledWith(error)
      expect(handled ? reportError : onError).not.toHaveBeenCalled()
    },
  )

  it('外部 loading 控制忙碌状态，不能覆盖显式 disabled', async () => {
    const onClick = vi.fn()
    const button = await render({ loading: true, onClick, type: 'submit' })
    await act(async () => button.click())
    expect(onClick).not.toHaveBeenCalled()
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.type).toBe('submit')
    await render({ loading: false, disabled: true, onClick })
    expect(button.disabled).toBe(true)
    expect(button.hasAttribute('aria-busy')).toBe(false)
    await render({ loading: false, disabled: false, onClick })
    await act(async () => button.click())
    expect(onClick).toHaveBeenCalledOnce()
  })
})
