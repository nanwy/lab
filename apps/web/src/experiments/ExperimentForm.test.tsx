import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { toast } from '@workspace/ui/components/sonner'
import { ExperimentForm } from './ExperimentForm'

let readState: () => { isSubmitting: boolean; isSubmitSuccessful: boolean }
let root: Root
let container: HTMLDivElement
let client: QueryClient

vi.mock('@tanstack/react-form', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-form')>()
  return {
    ...actual,
    useForm: (options: Parameters<typeof actual.useForm>[0]) => {
      const form = actual.useForm(options)
      readState = () => form.state
      return form
    },
  }
})
vi.mock('@workspace/ui/components/sonner', () => ({
  toast: { error: vi.fn() },
}))

afterEach(async () => {
  await act(async () => root?.unmount())
  client?.clear()
  container?.remove()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it('请求失败保持 Form 的失败状态、保留输入且无未处理拒绝，重试成功后才标记成功', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: '实验已锁定' }, { status: 400 }),
      )
      .mockResolvedValueOnce(Response.json({ id: 7 })),
  )
  const saved = vi.fn(async () => {})
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ExperimentForm
          experiment={{ id: 7, name: '保留的实验名称', desc: '' }}
          saved={saved}
          cancel={() => {}}
        />
      </QueryClientProvider>,
    )
  })
  const submit = () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await act(async () => {
    submit()
  })
  expect(toast.error).toHaveBeenCalledExactlyOnceWith('实验已锁定')
  expect(readState()).toMatchObject({
    isSubmitting: false,
    isSubmitSuccessful: false,
  })
  expect(saved).not.toHaveBeenCalled()
  expect(
    container.querySelector<HTMLInputElement>('input[name="name"]')?.value,
  ).toBe('保留的实验名称')
  await act(async () => {
    submit()
  })
  expect(saved).toHaveBeenCalledTimes(1)
  expect(readState()).toMatchObject({
    isSubmitting: false,
    isSubmitSuccessful: true,
  })
})
