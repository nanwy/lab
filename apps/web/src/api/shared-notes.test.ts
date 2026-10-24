import { afterEach, expect, it, vi } from 'vitest'
import { getSharedNotes } from './shared-notes'
afterEach(() => vi.unstubAllGlobals())
it('共享列表保留默认归档的独立课程和共享查询，而非个人列表参数', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json([{ id: 7, name: '共享实验' }]),
  )
  vi.stubGlobal('fetch', fetch)
  expect(
    await getSharedNotes(
      { folderId: 1, courseId: 10, type: 1, sectionId: 20 },
      'a & #',
    ),
  ).toEqual([{ id: 7, name: '共享实验' }])
  const url = new URL(String(fetch.mock.calls[0]?.[0]))
  expect(url.pathname).toBe(
    '/api/front/learn/task/my_notes/folders/1/courses/10/shared_notes/',
  )
  expect(Object.fromEntries(url.searchParams)).toEqual({
    course_id: '10',
    nopage: '1',
    search: 'a & #',
    section_id: '20',
    share: 'true',
  })
})
it('共享详情与个人评分独立读取，拒绝缺失和错误层级而不是伪造0分', async () => {
  const { getSharedNote, getNoteScore } = await import('./shared-notes')
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) =>
    new URL(String(input)).pathname.endsWith('/score/')
      ? Response.json({ data: { note_score: 3 } })
      : Response.json({
          id: 7,
          content: '<p>共享正文</p>',
          synthesis_score: 4.5,
          extend: null,
        }),
  )
  vi.stubGlobal('fetch', fetch)
  expect(await getSharedNote(7)).toEqual({
    id: 7,
    content: '<p>共享正文</p>',
    synthesis_score: 4.5,
    extend: null,
  })
  expect(await getNoteScore(7)).toBe(3)
  expect(fetch.mock.calls.map((c) => new URL(String(c[0])).pathname)).toEqual([
    '/api/front/share/note/7/',
    '/api/front/share/note/7/score/',
  ])
  fetch.mockResolvedValueOnce(Response.json({ note_score: 3 }))
  await expect(getNoteScore(7)).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})
it('评分仅提交1–5整数；分享使用个人端点并同时保存非空草稿，成功仅需id', async () => {
  const { scoreSharedNote, sharePersonalNote } = await import('./shared-notes')
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ status: 1 }),
  )
  vi.stubGlobal('fetch', fetch)
  await scoreSharedNote(7, 4)
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
    note_score: 4,
  })
  expect(new URL(String(fetch.mock.calls[0]?.[0])).pathname).toBe(
    '/api/front/share/note/7/score/',
  )
  expect(fetch.mock.calls[0]?.[1]?.method).toBe('POST')
  await expect(scoreSharedNote(7, 0)).rejects.toThrow()
  await expect(scoreSharedNote(7, 2.5)).rejects.toThrow()
  fetch.mockResolvedValueOnce(Response.json({ id: 7 }))
  await sharePersonalNote(7, true, '<p>草稿</p>')
  expect(new URL(String(fetch.mock.calls[1]?.[0])).pathname).toBe(
    '/api/front/user/note/7/',
  )
  expect(fetch.mock.calls[1]?.[1]?.method).toBe('PATCH')
  expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
    share: true,
    content: '<p>草稿</p>',
  })
  fetch.mockResolvedValueOnce(Response.json({ id: 7 }))
  await sharePersonalNote(7, false, '')
  expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body))).toEqual({
    share: false,
  })
  fetch.mockResolvedValueOnce(Response.json({ status: 2, message: '评分失败' }))
  await expect(scoreSharedNote(7, 4)).rejects.toMatchObject({
    kind: 'business',
  })
})
