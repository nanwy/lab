import { afterEach, expect, it, vi } from 'vitest'
import {
  getCourseOperates,
  getCoursePractice,
  getCourseCheckpoints,
  getCourseCheckpointTopic,
  answerCourseCheckpoint,
  finishCourseCheckpoint,
  submitCourseFlag,
} from './course-practice'
import {
  courseEnvironmentRequest,
  getCourseEnvironmentStatus,
  getCourseEnvironmentNodes,
  startCourseEnvironment,
  changeCourseEnvironment,
  courseConsoleHref,
} from './course-environment'
afterEach(() => vi.unstubAllGlobals())
const scope = {
  courseId: 'course/a',
  sectionId: 'section/b',
  operateId: 'operate/c',
}
it('课程操作项目与检查点协议单次编码，不复用整节测试，Flag不增加必填限制', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ status: 1 }),
  )
  vi.stubGlobal('fetch', fetch)
  fetch.mockResolvedValueOnce(
    Response.json([{ id: 'first' }, { id: 'second' }]),
  )
  expect(await getCourseOperates(scope.courseId, scope.sectionId)).toEqual([
    { id: 'first' },
    { id: 'second' },
  ])
  fetch.mockResolvedValueOnce(Response.json({ id: 'p', test_type: 'through' }))
  const practice = await getCoursePractice(scope)
  expect(practice.shared).toBe(false)
  fetch.mockResolvedValueOnce(Response.json([{ id: 'check', mode: 1 }]))
  expect((await getCourseCheckpoints(scope))[0]?.done).toBe(false)
  fetch.mockResolvedValueOnce(
    Response.json({ id: 'topic', name: '题目', option_type: 3 }),
  )
  expect(await getCourseCheckpointTopic(scope, 'check/d')).toMatchObject({
    content: {},
    user_option: [],
    done: false,
  })
  await answerCourseCheckpoint(scope, 'check/d', [])
  await finishCourseCheckpoint(scope, 'check/d', false)
  await finishCourseCheckpoint(scope, 'check/d', true)
  await submitCourseFlag(scope, 'check/d', '')
  const paths = fetch.mock.calls.map(([url]) => new URL(String(url)).pathname)
  expect(paths[4]).toBe(
    '/api/front/learn/task/self_study/open_courses/course%2Fa/section/section%2Fb/operate/operate%2Fc/checkpoint/topic/check%2Fd/answer/',
  )
  expect(paths[5]).toContain('/checkpoint/topic/check%2Fd/finish/')
  expect(paths[6]).toContain('/checkpoint/topic/check%2Fd/reset/')
  expect(paths[7]).toContain('/checkpoint/flag/check%2Fd/finish/')
  expect(JSON.parse(String(fetch.mock.calls[4]?.[1]?.body))).toEqual({
    option: [],
  })
  expect(fetch.mock.calls[5]?.[1]?.body).toBeUndefined()
  expect(JSON.parse(String(fetch.mock.calls[7]?.[1]?.body))).toEqual({
    flag: '',
  })
  fetch.mockResolvedValueOnce(Response.json({ status: 2, message: '失败' }))
  await expect(submitCourseFlag(scope, 'check', 'bad')).rejects.toMatchObject({
    kind: 'business',
  })
})
it('环境模板、运行ID和查询/启动共享来源各自独立，穿透与对抗assist按原分支', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({
      id: 'resource',
      test_type: 'through',
      shared: true,
      test_environment: { shared: false },
    }),
  )
  vi.stubGlobal('fetch', fetch)
  const p = await getCoursePractice(scope)
  fetch.mockResolvedValueOnce(
    Response.json([{ id: 'check', mode: 1, task_type: 2, topo: 'template' }]),
  )
  const c = (await getCourseCheckpoints(scope))[0]!
  const status = courseEnvironmentRequest(p, c, false),
    start = courseEnvironmentRequest(p, c, true)
  expect(status).toEqual({
    resource_type: 16,
    resource_id: 'resource',
    env_type: 2,
    env_id: 'template',
    start_type: 2,
    share: true,
    assist: { start_new_type: 1, check_id: 'check' },
  })
  expect(start.share).toBe(false)
  expect(
    courseEnvironmentRequest({ ...p, test_type: 'confront' }, c, true).assist,
  ).toEqual({ start_new_type: 1, confront: true })
  fetch.mockResolvedValueOnce(
    Response.json({ status: 1, data: { status: 3, run_id: 'run', times: 10 } }),
  )
  expect(await getCourseEnvironmentStatus(status)).toMatchObject({
    status: 3,
    run_id: 'run',
  })
  fetch.mockResolvedValueOnce(Response.json({ status: 1 }))
  await startCourseEnvironment(start)
  fetch.mockResolvedValueOnce(Response.json({ status: 1 }))
  await changeCourseEnvironment('run/a', 'delay')
  expect(JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body))).toEqual({
    run_id: 'run/a',
    resource_type: 16,
  })
  expect(new URL(String(fetch.mock.calls.at(-1)?.[0])).pathname).toBe(
    '/api/front/env/delay/run%2Fa/',
  )
  fetch.mockResolvedValueOnce(Response.json({ nodes: {} }))
  expect(await getCourseEnvironmentNodes('run/a')).toEqual({ nodes: {} })
  expect(String(fetch.mock.calls.at(-1)?.[0])).toContain(
    '/scene/run%2Fa/status/?task_type=16',
  )
  expect(() =>
    courseEnvironmentRequest(p, { ...c, topo: null }, false),
  ).toThrow('环境模板')
})
it('控制台沿原节点类型映射到既有路由，外部协议不伪装成VNC', () => {
  expect(courseConsoleHref('node/a', { type: 'docker_webide' })).toBe(
    '/#/vnccontrol/docker/node%2Fa',
  )
  expect(courseConsoleHref('node', { type: 'qemu' })).toBe(
    '/#/vnccontrol/vpcs/node',
  )
  expect(
    courseConsoleHref('node', { type: 'libvirt', console_type: 'telnet' }),
  ).toBe('/#/vnccontrol/vpcs/node')
  expect(courseConsoleHref('node', { type: 'libvirt', name: '节点' })).toBe(
    '/#/kvmvnc/vnc/node/%E8%8A%82%E7%82%B9',
  )
  expect(
    courseConsoleHref('node', {
      type: 'other',
      console_type: 'ssh',
      console_port: 2200,
    }),
  ).toContain('ssh://')
  expect(() =>
    courseConsoleHref('node', {
      type: 'other',
      console_type: 'javascript',
      console_port: 1,
    }),
  ).toThrow('控制台协议')
})
