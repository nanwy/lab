import { afterEach, expect, it, vi } from 'vitest'
import {
  getNoteFolders,
  getPersonalNote,
  getPersonalNotes,
  saveNoteFolder,
  deleteNoteFolder,
  saveNoteMetadata,
  savePersonalNote,
  deletePersonalNote,
  exportPersonalNote,
  canEnterNoteCourse,
} from './personal-notes'
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
it('默认归档和自定义笔记列表各自使用目录端点及原过滤字段', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json([{ id: 'n', name: '记录' }]),
  )
  vi.stubGlobal('fetch', fetch)
  expect(
    await getPersonalNotes({ folderId: 1, courseId: 10, type: 1 }, '关键字'),
  ).toEqual([{ id: 'n', name: '记录' }])
  await getPersonalNotes({ folderId: 2, courseId: 20, type: 2 }, '')
  await getPersonalNotes(
    { folderId: 9, courseId: 0, type: 5, sectionId: 22 },
    '',
  )
  const urls = fetch.mock.calls.map((c) => new URL(String(c[0])))
  expect(urls[0]?.pathname).toBe(
    '/api/front/learn/task/my_notes/folders/1/courses/10/notes/',
  )
  expect(urls[0]?.searchParams.has('type')).toBe(false)
  expect(urls[1]?.searchParams.get('type')).toBe('2')
  expect(urls[1]?.searchParams.get('course_id')).toBe('20')
  expect(urls[2]?.pathname).toBe(
    '/api/front/learn/task/my_notes/folders/9/courses/0/notes/',
  )
  expect(urls[2]?.searchParams.get('section_id')).toBe('22')
  expect(urls[2]?.searchParams.has('course_id')).toBe(false)
})
it('目录新建改名删除保持原名称和成功判据，删除拒绝不会成功', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ id: 9, message: '完成' }),
  )
  vi.stubGlobal('fetch', fetch)
  await saveNoteFolder(' /研究? ')
  await saveNoteFolder(' 改名 ', 9)
  await deleteNoteFolder(9)
  expect(
    fetch.mock.calls.map((c) => JSON.parse(String(c[1]?.body || '{}'))),
  ).toEqual([{ name: ' /研究? ' }, { id: 9, name: ' 改名 ' }, {}])
  expect(fetch.mock.calls.map((c) => new URL(String(c[0])).pathname)).toEqual([
    '/api/front/learn/task/my_notes/folders/create/',
    '/api/front/learn/task/my_notes/folders/9/rename/',
    '/api/front/learn/task/my_notes/folders/9/delete/',
  ])
  fetch.mockResolvedValueOnce(Response.json({ status: 2, message: '拒绝删除' }))
  await expect(deleteNoteFolder(9)).rejects.toMatchObject({ kind: 'business' })
})
it('个人笔记新增和改名走目录，正文和删除走个人端点且不破坏extend', async () => {
  const note = {
    id: 'n1',
    name: '记录',
    content: '<p>正文</p>',
    share: true,
    extend: { breakpoint_time: 12, opaque: '保留' },
  }
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) =>
    Response.json(
      String(url).includes('delete')
        ? { status: 1 }
        : init?.method === 'GET'
          ? { ...note, content: '<p>更新</p>' }
          : note,
    ),
  )
  vi.stubGlobal('fetch', fetch)
  const context = { folderId: 2, courseId: 20, type: 2 }
  await saveNoteMetadata(context, ' 新建 ')
  await saveNoteMetadata(context, ' 改名 ', note)
  await savePersonalNote('n1', '<p>更新</p>')
  await deletePersonalNote('n1')
  expect(
    fetch.mock.calls
      .filter((c) => c[1]?.method !== 'GET')
      .map((c) => JSON.parse(String(c[1]?.body))),
  ).toEqual([
    {
      name: ' 新建 ',
      share: false,
      extend: { breakpoint_time: '' },
      course_id: 20,
      type: 2,
    },
    {
      name: ' 改名 ',
      share: true,
      extend: note.extend,
      course_id: 20,
      type: 2,
    },
    { content: '<p>更新</p>' },
    { ids: ['n1'] },
  ])
  expect(
    fetch.mock.calls
      .filter((c) => c[1]?.method !== 'GET')
      .map((c) => new URL(String(c[0])).pathname),
  ).toEqual([
    '/api/front/learn/task/my_notes/folders/2/courses/20/notes/',
    '/api/front/learn/task/my_notes/folders/2/courses/20/notes/n1/',
    '/api/front/user/note/n1/',
    '/api/front/user/note/delete/',
  ])
})
it('Word只读唯一file_path并拒绝伪成功，驻点读取原can_enter', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ status: 1, data: { file_path: '/files/n.docx' } }),
  )
  vi.stubGlobal('fetch', fetch)
  expect(await exportPersonalNote('n1')).toBe('/files/n.docx')
  expect(fetch.mock.calls[0]?.[1]?.method).toBe('POST')
  expect(fetch.mock.calls[0]?.[1]?.body).toBeUndefined()
  fetch.mockResolvedValueOnce(
    Response.json({ status: 1, data: { url: '/wrong.docx' } }),
  )
  await expect(exportPersonalNote('n1')).rejects.toMatchObject({
    kind: 'invalid-response',
  })
  fetch.mockResolvedValueOnce(Response.json({ can_enter: false }))
  expect(await canEnterNoteCourse(10)).toBe(false)
  expect(String(fetch.mock.calls.at(-1)?.[0])).toContain(
    '/front/learn/task/self_study/open_courses/10/can_enter/',
  )
})
it('正文PATCH仅返回id仍能通过独立详情读回，不假设写响应完整字段', async () => {
  const note = {
    id: 'n1',
    name: '记录',
    content: '<p>已保存</p>',
    share: false,
    extend: null,
  }
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof globalThis.fetch>(async (_url, options) =>
      Response.json(options?.method === 'PATCH' ? { id: 'n1' } : note),
    ),
  )
  expect(await savePersonalNote('n1', note.content)).toEqual(note)
})
