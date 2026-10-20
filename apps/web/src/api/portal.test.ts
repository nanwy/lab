import { afterEach, expect, it, vi } from 'vitest'
import {
  getRecommendations,
  saveRecommendationSettings,
  recommendationSettingsSchema,
  getCourseAvailability,
  getPlatformLogo,
} from './portal'

afterEach(() => vi.unstubAllGlobals())
it('未设置品牌标识时允许原接口省略品牌字段，错误类型仍拒绝', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ email_certif: false, onlyoffice_url: '' }),
    ),
  )
  await expect(getPlatformLogo()).resolves.toEqual({})
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ platform_name: 123 })),
  )
  await expect(getPlatformLogo()).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})
it('推荐读取包裹协议、保存六项权重保留 data 层，课程入口检查 is_open', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, options?: RequestInit) => {
      if (String(url).endsWith('/config/')) {
        expect(JSON.parse(String(options?.body))).toEqual({
          data: {
            position: 1,
            direction: 2,
            learning_content: 3,
            knowledge_system_width: 4,
            knowledge_system_depth: 5,
            failed_skills: 6,
          },
        })
        return Response.json({ status: 1 })
      }
      if (String(url).endsWith('/brief/'))
        return Response.json({ is_open: false })
      return Response.json({
        status: 1,
        data: { learning_route: [], practical_operation: null, course: [] },
      })
    }),
  )
  await expect(getRecommendations()).resolves.toEqual({
    learning_route: [],
    practical_operation: null,
    course: [],
  })
  const values = {
    position: 1,
    direction: 2,
    learning_content: 3,
    knowledge_system_width: 4,
    knowledge_system_depth: 5,
    failed_skills: 6,
  }
  await expect(saveRecommendationSettings(values)).resolves.toEqual({
    status: 1,
  })
  expect(
    recommendationSettingsSchema.safeParse({ ...values, position: 11 }).success,
  ).toBe(false)
  await expect(getCourseAvailability('course/a')).resolves.toEqual({
    is_open: false,
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ learning_route: [], course: [] })),
  )
  await expect(getRecommendations()).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})
