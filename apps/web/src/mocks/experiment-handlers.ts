import { http, HttpResponse } from 'msw'
import { appConfig } from '../config'
import {
  experimentInputSchema,
  experimentInfoSchema,
  type Experiment,
  type ExperimentDetail,
} from '../api/experiments'

// 仅模拟服务持久化；组件和 Query 不再维护第二份可写实验数据。
type StoredExperiment = Experiment &
  ExperimentDetail & { period: 'today' | 'before' }
const scenes = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  name: `模拟场景 ${index + 1}`,
  sub_user: '模拟发布者',
  create_time: '2026-10-20',
}))
function newExperiment(
  id: number,
  name: string,
  desc: string,
  source: 1 | 2,
): StoredExperiment {
  return {
    id,
    name,
    desc,
    source,
    node_count: 0,
    start_status: false,
    create_time: '2026-10-20',
    user_name: '模拟学员',
    tags: [],
    overview: '',
    release_type: 2,
    max_duration: 2,
    tags_category: null,
    period: 'today',
  }
}
export function createExperimentHandlers() {
  const key = 'mock-experiments-v1'
  function read(): { nextId: number; items: StoredExperiment[] } {
    const stored = sessionStorage.getItem(key)
    return stored
      ? JSON.parse(stored)
      : {
          nextId: 13,
          items: Array.from({ length: 12 }, (_, index) => ({
            ...newExperiment(
              index + 1,
              `模拟实验 ${index + 1}`,
              '本地模拟实验，不代表原服务数据。',
              1,
            ),
            period: index === 11 ? 'before' : 'today',
          })),
        }
  }
  const save = (value: ReturnType<typeof read>) =>
    sessionStorage.setItem(key, JSON.stringify(value))
  const base = `${appConfig.apiBaseUrl}/front/simulation/experiment/`
  const denied = () => HttpResponse.json({ error: '未登录' }, { status: 403 })
  const allowed = (request: Request) =>
    request.headers.get('authorization') === 'Token mock-session'
  function page<T extends { name: string }>(items: T[], request: Request) {
    const query = new URL(request.url).searchParams
    const filtered = items.filter((item) =>
      item.name.includes(query.get('search') ?? ''),
    )
    const start = (Math.max(1, Number(query.get('page') ?? 1)) - 1) * 10
    return HttpResponse.json({
      count: filtered.length,
      results: filtered.slice(start, start + 10),
    })
  }
  return [
    http.get(base, ({ request }) =>
      allowed(request)
        ? page(
            read().items.filter((item) => item.period === 'today'),
            request,
          )
        : denied(),
    ),
    http.get(`${base}more/`, ({ request }) =>
      allowed(request)
        ? page(
            read().items.filter((item) => item.period === 'before'),
            request,
          )
        : denied(),
    ),
    http.get(`${base}expreiment_scene/`, ({ request }) =>
      allowed(request) ? page(scenes, request) : denied(),
    ),
    http.get(`${base}select/:id/`, ({ request, params }) => {
      if (!allowed(request)) return denied()
      const scene = scenes.find((scene) => String(scene.id) === params.id)
      if (!scene) return HttpResponse.json({}, { status: 404 })
      const state = read()
      state.items.unshift(
        newExperiment(state.nextId++, scene.name, '从模拟场景库导入。', 2),
      )
      save(state)
      return HttpResponse.json({ status: 1 })
    }),
    http.post(base, async ({ request }) => {
      if (!allowed(request)) return denied()
      const value = experimentInputSchema.safeParse(await request.json())
      if (!value.success) return HttpResponse.json({}, { status: 400 })
      const state = read()
      const item = newExperiment(
        state.nextId++,
        value.data.name,
        value.data.desc,
        1,
      )
      state.items.unshift(item)
      save(state)
      return HttpResponse.json(item)
    }),
    http.post(`${base}delete/`, async ({ request }) => {
      if (!allowed(request)) return denied()
      const { ids } = (await request.json()) as { ids: Array<string | number> }
      const state = read()
      state.items = state.items.filter(
        (item) => !ids.some((id) => String(id) === String(item.id)),
      )
      save(state)
      return HttpResponse.json({ status: 1 })
    }),
    http.get(`${base}:id/`, ({ request, params }) => {
      if (!allowed(request)) return denied()
      const item = read().items.find((item) => String(item.id) === params.id)
      return item
        ? HttpResponse.json(item)
        : HttpResponse.json({}, { status: 404 })
    }),
    http.patch(`${base}:id/`, async ({ request, params }) => {
      if (!allowed(request)) return denied()
      const state = read()
      const item = state.items.find((item) => String(item.id) === params.id)
      if (!item) return HttpResponse.json({}, { status: 404 })
      const value = experimentInfoSchema
        .partial({ tag: true })
        .safeParse(await request.json())
      if (!value.success) return HttpResponse.json({}, { status: 400 })
      item.name = value.data.name
      item.desc = value.data.desc
      if (value.data.tag) item.tags = value.data.tag.map((name) => ({ name }))
      save(state)
      return HttpResponse.json(item)
    }),
    http.get(`${appConfig.apiBaseUrl}/front/base/tag/`, ({ request }) =>
      allowed(request)
        ? HttpResponse.json(
            ['网络', '安全', '基础', '攻防', '设备', '路由'].map((name) => ({
              name,
            })),
          )
        : denied(),
    ),
  ]
}
