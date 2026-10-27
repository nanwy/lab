import { afterEach, expect, it, vi } from 'vitest'
import {
  getCourseMaterials,
  getCourses,
  initialCourseFilter,
  getCourseCatalog,
  courseSections,
  addCourseComment,
  deleteCourseComment,
  changeCourseCollection,
  getCourse,
} from './courses'

afterEach(() => vi.unstubAllGlobals())
const file = {
  id: 'file',
  name: '说明.txt',
  path: '/说明.txt',
  is_file: 1,
  attached: '/media/manual.txt',
  size: 12,
  type: 'text/plain',
}

it('课程资料拒绝重复行标识，避免多选把不同文件合并', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json([file, { ...file, name: '另一个文件.txt' }]),
    ),
  )
  await expect(getCourseMaterials('one', '/')).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})

it('课程详情不要求仅列表卡片使用的type字段', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        id: 'one',
        name: '课程',
        mode: 2,
        is_collect: false,
        course_direction_list: [],
      }),
    ),
  )
  await expect(getCourse('one')).resolves.toMatchObject({
    id: 'one',
    name: '课程',
    mode: 2,
  })
})

it('公开课程筛选保留重复标签键、岗位和未完成值，不发送内部方向参数', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ count: 0, results: [] }),
  )
  vi.stubGlobal('fetch', fetch)
  await getCourses({
    ...initialCourseFilter,
    page: 2,
    search: '网络&系统',
    tag: ['网络'],
    directions: ['安全'],
    difficulty: [2],
    grade: ['1'],
    complete: ['0'],
    position: [3],
  })
  const url = new URL(String(fetch.mock.calls[0]![0]))
  expect(url.pathname).toBe(
    '/api/front/learn/task/self_study/open_courses/list/',
  )
  expect(url.searchParams.getAll('tag')).toEqual(['网络', '安全'])
  expect(
    Object.fromEntries([...url.searchParams].filter(([key]) => key !== 'tag')),
  ).toEqual({
    page: '2',
    size: '12',
    search: '网络&系统',
    difficulty: '2',
    grade: '1',
    complete: '0',
    position: '3',
  })
})

it('课程资料直接数组允许缺失或空时间，单次编码路径，拒绝异常文件', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json([
      file,
      { ...file, id: 'second', size: '24', altertime: null },
    ]),
  )
  vi.stubGlobal('fetch', fetch)
  const result = await getCourseMaterials('a/b', '/一层/二层')
  expect(result.map((f) => ({ size: f.size, time: f.altertime }))).toEqual([
    { size: 12, time: undefined },
    { size: 24, time: null },
  ])
  const url = new URL(String(fetch.mock.calls[0]![0]))
  expect(url.pathname).toBe(
    '/api/front/learn/task/self_study/open_courses/a%2Fb/resource/',
  )
  expect(url.searchParams.get('parent_path')).toBe('/一层/二层')
  for (const body of [
    { results: [file] },
    [{ ...file, attached: null }],
    [{ ...file, attached: 'javascript:alert(1)' }],
    [{ ...file, size: 'NaN' }],
  ]) {
    fetch.mockResolvedValueOnce(Response.json(body))
    await expect(getCourseMaterials('one', '/')).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  }
})

it('平铺与章下小节均保留真实章节ID，空目录合法', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json([
      {
        id: 'chapter',
        name: '章',
        section: [{ id: 'lesson', name: '节', type: 1, finish: false }],
      },
    ]),
  )
  vi.stubGlobal('fetch', fetch)
  expect(
    courseSections(await getCourseCatalog('one')).map((s) => s.id),
  ).toEqual(['lesson'])
  fetch.mockResolvedValueOnce(
    Response.json([{ id: 2, name: '平铺', type: 2, finish_rate: 0 }]),
  )
  expect(
    courseSections(await getCourseCatalog('one')).map((s) => s.id),
  ).toEqual([2])
  fetch.mockResolvedValueOnce(Response.json([]))
  expect(await getCourseCatalog('one')).toEqual([])
})

it('评论、回复、删除和收藏使用原写入语义且不去除空白评论', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ status: 1, content: ' ' }),
  )
  vi.stubGlobal('fetch', fetch)
  await addCourseComment('one', ' ', undefined)
  await addCourseComment('one', '回复', 'a/b')
  await deleteCourseComment('one', 'comment')
  await changeCourseCollection('one', false)
  await changeCourseCollection('one', true)
  expect(
    fetch.mock.calls.map(([url, options]) => ({
      path: new URL(String(url)).pathname,
      method: options?.method,
      body: JSON.parse(String(options?.body)),
    })),
  ).toEqual([
    {
      path: '/api/front/learn/task/self_study/open_courses/one/comment/',
      method: 'POST',
      body: { content: ' ' },
    },
    {
      path: '/api/front/learn/task/self_study/open_courses/one/comment/a%2Fb/',
      method: 'POST',
      body: { content: '回复' },
    },
    {
      path: '/api/front/learn/task/self_study/open_courses/one/comment/delete/',
      method: 'POST',
      body: { level1: ['comment'] },
    },
    {
      path: '/api/front/user/collect/',
      method: 'POST',
      body: { attribute: 1, object_id: 'one' },
    },
    {
      path: '/api/front/user/collect/batch/',
      method: 'POST',
      body: { attribute: 1, ids: ['one'] },
    },
  ])
})
