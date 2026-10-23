import { afterEach, expect, it, vi } from 'vitest'
import { createFileFolder } from './personal-files'
afterEach(() => vi.unstubAllGlobals())
it('新建文件夹发送原目录和处理后的名称', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({}))
  vi.stubGlobal('fetch', fetch)
  await createFileFolder(' 资/料? ', '/资料 & #')
  expect(fetch).toHaveBeenCalledOnce()
  const [url, options] = fetch.mock.calls[0]!
  expect(String(url)).toContain('/front/learn/task/my_profile/files/folder/')
  expect(options?.method).toBe('POST')
  expect(JSON.parse(String(options?.body))).toEqual({
    name: '资料',
    parent_path: '/资料 & #',
  })
})
it('重命名、共享和批量删除各用原字段，批量共享对象不被禁止', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({}))
  vi.stubGlobal('fetch', fetch)
  const { renamePersonalFile, sharePersonalFile, deletePersonalFiles } =
    await import('./personal-files')
  await renamePersonalFile('file #1', ' 新<名> ')
  await sharePersonalFile('shared', true)
  await deletePersonalFiles(['shared', 'mine'])
  expect(
    fetch.mock.calls.map(([url, options]) => [
      new URL(String(url)).pathname,
      options?.method,
      JSON.parse(String(options?.body)),
    ]),
  ).toEqual([
    [
      '/api/front/learn/task/my_profile/files/file%20%231/rename/',
      'PUT',
      { name: '新名' },
    ],
    [
      '/api/front/learn/task/my_profile/files/shared/share/',
      'PUT',
      { is_share: true },
    ],
    [
      '/api/front/learn/task/my_profile/files/batch-delete/',
      'POST',
      { id: ['shared', 'mine'] },
    ],
  ])
  await expect(deletePersonalFiles(['..'])).rejects.toThrow('请选择有效文件')
  await expect(renamePersonalFile('mine', '////')).rejects.toThrow()
  expect(fetch).toHaveBeenCalledTimes(3)
})
