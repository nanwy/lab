import { afterEach, expect, it, vi } from 'vitest'
import {
  getCourseSectionTest,
  saveCourseTestAnswer,
  finishCourseSectionTest,
  resetCourseSectionTest,
} from './course-tests'
afterEach(() => vi.unstubAllGlobals())
const scope = { courseId: 'course/a', sectionId: 'section/b' }
const question = {
  id: 'question/c',
  name: '测试题',
  option_type: 1,
  content: { A: '选项' },
  user_option: [],
}
it('章节测试按课程、小节、题目独立编码，保存选项数组，完成/重置无body', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ status: 1 }),
  )
  vi.stubGlobal('fetch', fetch)
  fetch.mockResolvedValueOnce(
    Response.json({ done: false, results: [question] }),
  )
  await expect(getCourseSectionTest(scope)).resolves.toMatchObject({
    done: false,
    results: [question],
  })
  expect(String(fetch.mock.calls[0]![0])).toContain(
    '/course%2Fa/section/section%2Fb/test/?size=1000',
  )
  await saveCourseTestAnswer(scope, 'question/c', [])
  await finishCourseSectionTest(scope)
  await resetCourseSectionTest(scope)
  expect(
    fetch.mock.calls.slice(1).map(([url, options]) => ({
      path: new URL(String(url)).pathname,
      method: options?.method,
      body: options?.body,
    })),
  ).toEqual([
    {
      path: '/api/front/learn/task/self_study/open_courses/course%2Fa/section/section%2Fb/test/question%2Fc/',
      method: 'POST',
      body: '{"option":[]}',
    },
    {
      path: '/api/front/learn/task/self_study/open_courses/course%2Fa/section/section%2Fb/test/finish/',
      method: 'POST',
      body: undefined,
    },
    {
      path: '/api/front/learn/task/self_study/open_courses/course%2Fa/section/section%2Fb/test/reset/',
      method: 'POST',
      body: undefined,
    },
  ])
  fetch.mockResolvedValueOnce(Response.json({ status: 2, message: '拒绝提交' }))
  await expect(finishCourseSectionTest(scope)).rejects.toMatchObject({
    kind: 'business',
  })
})
it('未完成题目允许缺结果和解析，空题合法；完成态保留原缺省结果分支，重复题ID明确拒绝', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({
      done: false,
      results: [{ ...question, parse: null, answer: null }],
    }),
  )
  vi.stubGlobal('fetch', fetch)
  await expect(getCourseSectionTest(scope)).resolves.toMatchObject({
    done: false,
  })
  fetch.mockResolvedValueOnce(Response.json({ done: true, results: [] }))
  await expect(getCourseSectionTest(scope)).resolves.toMatchObject({
    results: [],
  })
  for (const payload of [
    { done: false, results: [question, question] },
    { done: false, results: [{ ...question, user_option: ['不存在'] }] },
    { done: false, results: [{ ...question, option_type: 4 }] },
  ]) {
    fetch.mockResolvedValueOnce(Response.json(payload))
    await expect(getCourseSectionTest(scope)).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  }
})

it('缺失完成标记沿原未完成分支，不把可选展示标记设为必填', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ results: [question] })),
  )
  await expect(getCourseSectionTest(scope)).resolves.toMatchObject({
    done: false,
  })
})

it('完成题目缺status仍保留原答案和解析，不额外阻止整节阅读', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        done: true,
        results: [{ ...question, answer: ['A'], parse: '原解析' }],
      }),
    ),
  )
  await expect(getCourseSectionTest(scope)).resolves.toMatchObject({
    done: true,
    results: [{ id: 'question/c', answer: ['A'], parse: '原解析' }],
  })
})
