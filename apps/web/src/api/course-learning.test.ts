import { afterEach, expect, it, vi } from 'vitest'
import {
  addCourseVideoLog,
  getCourseNotes,
  saveCourseNoteMetadata,
} from './courses'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
it('学习日志保留原毫秒时间、分片JSON、取整时长及MD5协议', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ status: 1 }),
  )
  vi.stubGlobal('fetch', fetch)
  await addCourseVideoLog('a/b', '节', { 'segment00.ts': 2 }, 64)
  expect(new URL(String(fetch.mock.calls[0]![0])).pathname).toBe(
    '/api/front/learn/task/self_study/open_courses/a%2Fb/section/%E8%8A%82/video/log/',
  )
  expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({
    video_log: { 'segment00.ts': 2 },
    sum_duration: 64,
    timestamp: 1700000000000,
    token: 'e50aff39df043b9fe6464a5f80dc430f',
  })
  fetch.mockResolvedValueOnce(Response.json({ status: 2, message: '日志失败' }))
  await expect(
    addCourseVideoLog('a/b', '节', { 'segment00.ts': 2 }, 64),
  ).rejects.toMatchObject({ kind: 'business' })
})
it('课程笔记专属列表与元数据保留章节、共享及extend，不混用个人归档', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json([]))
  vi.stubGlobal('fetch', fetch)
  const scope = { courseId: 'a/b', sectionId: 2 }
  await getCourseNotes(scope, false, '搜索')
  await getCourseNotes(scope, true, '')
  expect(
    fetch.mock.calls.map(([url]) => {
      const parsed = new URL(String(url))
      return {
        path: parsed.pathname,
        query: Object.fromEntries(parsed.searchParams),
      }
    }),
  ).toEqual([
    {
      path: '/api/front/user/note/',
      query: { nopage: '1', search: '搜索', course_id: 'a/b', section_id: '2' },
    },
    {
      path: '/api/front/share/note/',
      query: { nopage: '1', search: '', course_id: 'a/b', section_id: '2' },
    },
  ])
  fetch.mockResolvedValueOnce(Response.json({ id: 'n' }))
  await saveCourseNoteMetadata(
    scope,
    ' ',
    true,
    { breakpoint_time: 4, preserved: '原字段' },
    'n',
  )
  expect(fetch.mock.calls[2]![1]?.method).toBe('PATCH')
  expect(JSON.parse(String(fetch.mock.calls[2]![1]?.body))).toEqual({
    name: ' ',
    share: true,
    extend: { breakpoint_time: 4, preserved: '原字段' },
    type: 1,
    course_id: 'a/b',
    section_id: 2,
  })
  fetch.mockResolvedValueOnce(Response.json({ results: [] }))
  await expect(getCourseNotes(scope, false, '')).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})
