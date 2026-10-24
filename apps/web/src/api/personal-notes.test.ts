import { afterEach, expect, it, vi } from 'vitest'
import { getNoteFolders, getPersonalNote } from './personal-notes'
afterEach(() => vi.unstubAllGlobals())
it('读取笔记目录直接数组，搜索仅编码一次并保持默认和自定义归属', async () => {
  const folders = [
    { id: 1, name: '课程', type: 1, courses: [{ id: 10, name: '专题' }] },
    { id: 'custom', name: '研究', type: 5, courses: [] },
  ]
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json(folders),
  )
  vi.stubGlobal('fetch', fetch)
  expect(await getNoteFolders('笔记 & #')).toEqual(folders)
  const url = new URL(String(fetch.mock.calls[0]?.[0]))
  expect(url.pathname).toBe('/api/front/learn/task/my_notes/folders/')
  expect(url.searchParams.get('search')).toBe('笔记 & #')
  expect(url.searchParams.get('nopage')).toBe('1')
})
it('个人详情保留extend原值，不把缺失正文伪造为空笔记', async () => {
  const note = {
    id: 'n1',
    name: '研究',
    content: '<p>正文</p>',
    share: false,
    extend: null,
  }
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(note))
  vi.stubGlobal('fetch', fetch)
  expect(await getPersonalNote('n1')).toEqual(note)
  expect(new URL(String(fetch.mock.calls[0]?.[0])).pathname).toBe(
    '/api/front/user/note/n1/',
  )
  fetch.mockResolvedValueOnce(
    Response.json({ id: 'n1', name: '缺失正文', share: false, extend: {} }),
  )
  await expect(getPersonalNote('n1')).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})
