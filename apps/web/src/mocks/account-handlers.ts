import { HttpResponse, http } from 'msw'
import { appConfig } from '../config'

// 仅 MSW 使用的模拟服务数据；资料在当前标签页刷新后保留，密码不持久化。
export function createAccountHandlers() {
  let password = 'xueyuan123'
  const initialUser = {
    id: 'learner-001',
    username: 'learner',
    realname: '模拟学员',
    unit: '模拟单位',
    phone: '',
    email: '',
    logo: '',
    job_number: '001',
    extend_info: { first_entry: true, position: [7] },
  }
  function readUser() {
    const saved = sessionStorage.getItem('mock-account-profile')
    return saved ? JSON.parse(saved) : initialUser
  }
  function authorized(request: Request) {
    return request.headers.get('authorization') === 'Token mock-session'
  }
  const denied = () => HttpResponse.json({ error: '未登录' }, { status: 403 })
  const url = (path: string) => `${appConfig.apiBaseUrl}${path}`
  return [
    http.post(url('/front/login/'), async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      if (body.code !== '2468')
        return HttpResponse.json({ code: '验证码错误' }, { status: 400 })
      if (body.username !== 'learner' || body.password !== password)
        return HttpResponse.json(
          { password: '用户名或密码错误' },
          { status: 400 },
        )
      localStorage.setItem('token', 'mock-session')
      return HttpResponse.json({ status: 1 })
    }),
    http.get(url('/front/user/info/'), ({ request }) =>
      authorized(request) ? HttpResponse.json(readUser()) : denied(),
    ),
    http.patch(url('/front/user/info/'), async ({ request }) => {
      if (!authorized(request)) return denied()
      let changes: Record<string, unknown>
      if (
        request.headers.get('content-type')?.includes('multipart/form-data')
      ) {
        const logo = (await request.formData()).get('logo')
        if (!(logo instanceof File))
          return HttpResponse.json({}, { status: 400 })
        const bytes = new Uint8Array(await logo.arrayBuffer())
        let binary = ''
        for (const byte of bytes) binary += String.fromCharCode(byte)
        changes = { logo: `data:${logo.type};base64,${btoa(binary)}` }
      } else changes = (await request.json()) as Record<string, unknown>
      const user = { ...readUser(), ...changes }
      sessionStorage.setItem('mock-account-profile', JSON.stringify(user))
      return HttpResponse.json(user)
    }),
    http.post(url('/front/user/password/'), async ({ request }) => {
      if (!authorized(request)) return denied()
      const body = (await request.json()) as Record<string, unknown>
      if (body.cipher !== password)
        return HttpResponse.json({ cipher: '原密码错误' }, { status: 400 })
      if (
        typeof body.password !== 'string' ||
        !body.password ||
        body.password !== body.confirm_password
      )
        return HttpResponse.json({ status: 2 })
      password = body.password
      return HttpResponse.json({ status: 1 })
    }),
    http.get(
      url('/front/exam/ability_appraisa/study_situation/'),
      ({ request }) =>
        authorized(request)
          ? HttpResponse.json({
              status: 1,
              data: {
                login_day: 12,
                study_length: 3,
                finished_course: 2,
                finished_subject_scene: 1,
                finished_assessment: 0,
              },
            })
          : denied(),
    ),
  ]
}
