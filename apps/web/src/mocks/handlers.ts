import { HttpResponse, delay, http } from 'msw'
import { createSampleHandlers } from './sample-handlers'
import { appConfig } from '../config'
import { portalFixtures } from './portal-fixtures'

export const handlers = [
  ...Object.entries(portalFixtures).map(([path]) => {
    const [pathname, search] = path.split('?')
    return http.get(`${appConfig.apiBaseUrl}${pathname}`, ({ request }) => {
      if (search && new URL(request.url).search !== `?${search}`) return
      return HttpResponse.json(portalFixtures[path])
    })
  }),
  http.post(`${appConfig.apiBaseUrl}/admin/system/active/:mode/`, () =>
    HttpResponse.json({ status: 1 }),
  ),
  http.post(
    `${appConfig.apiBaseUrl}/front/user/recommend/config/`,
    async ({ request }) => {
      const { data } = (await request.json()) as { data: unknown }
      portalFixtures['/front/user/recommend/config/'] = { status: 1, data }
      return HttpResponse.json({ status: 1 })
    },
  ),
  http.get(
    `${appConfig.apiBaseUrl}/front/learn/task/self_study/open_courses/:id/brief/`,
    () => HttpResponse.json({ is_open: true }),
  ),
  http.get(`${appConfig.apiBaseUrl}/admin/system/background/`, () =>
    HttpResponse.json({ front_background: '' }),
  ),
  http.get(
    `${appConfig.apiBaseUrl}/captcha/`,
    () =>
      new HttpResponse(
        '<svg xmlns="http://www.w3.org/2000/svg" width="104" height="40" viewBox="0 0 104 40"><rect width="104" height="40" fill="#e7f4ff"/><path d="M5 31L99 8M8 8L96 33" stroke="#86b7da"/><text x="52" y="27" text-anchor="middle" font-family="monospace" font-size="22" font-weight="700" fill="#174d73">2468</text></svg>',
        { headers: { 'content-type': 'image/svg+xml' } },
      ),
  ),
  http.post(`${appConfig.apiBaseUrl}/front/login/`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    if (body.code !== '2468') {
      return HttpResponse.json({ code: '验证码错误' }, { status: 400 })
    }
    if (body.username !== 'learner' || body.password !== 'xueyuan123') {
      return HttpResponse.json(
        { password: '用户名或密码错误' },
        { status: 400 },
      )
    }
    localStorage.setItem('token', 'mock-session')
    return HttpResponse.json({ status: 1 })
  }),
  http.get(`${appConfig.apiBaseUrl}/front/user/info/`, ({ request }) =>
    request.headers.get('authorization') === 'Token mock-session'
      ? HttpResponse.json({
          id: 'learner-001',
          username: 'learner',
          extend_info: { first_entry: true },
        })
      : HttpResponse.json({ error: '未登录' }, { status: 403 }),
  ),
  http.get(`${appConfig.apiBaseUrl}/front/logout/`, () => {
    localStorage.removeItem('token')
    return HttpResponse.json({ status: 1 })
  }),
  ...createSampleHandlers(),
  http.get(`${appConfig.apiBaseUrl}/diagnostics`, async ({ request }) => {
    const mode = new URL(request.url).searchParams.get('mode')

    if (mode === 'empty') return HttpResponse.json({ items: [] })
    if (mode === 'http-error') {
      return HttpResponse.json(
        { message: '模拟服务暂时不可用' },
        { status: 503 },
      )
    }
    if (mode === 'business-error') {
      return HttpResponse.json({
        success: false,
        message: '模拟资源状态不允许此操作',
        fieldErrors: { state: '资源已锁定' },
      })
    }
    if (mode === 'slow' || mode === 'timeout') await delay(300)

    return HttpResponse.json({
      items: [
        { id: 'mock-01', label: '统一客户端' },
        { id: 'mock-02', label: 'TanStack Query' },
      ],
    })
  }),
]
