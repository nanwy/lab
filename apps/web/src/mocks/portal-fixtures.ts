/** 确定性模拟数据，不代表线上字段值或授权。 */
export const portalFixtures: Record<
  string,
  Record<string, unknown> | Record<string, unknown>[]
> = {
  '/front/user/notice/count/': { status: 1, data: 0 },
  '/front/user/notice/?page=1&size=10': { count: 0, results: [] },
  '/front/user/todo/count/': { status: 1, data: { count: 0 } },
  '/front/position/?nopage=1': [{ id: 7, name: '模拟安全岗位' }],
  '/front/user/todo/?nopage=1': [],
  '/front/user/collect/?nopage=1': [],
  '/admin/system/logo/default/': {
    platform_name: '网络安全攻防训练平台',
    front_logo: '',
    icon: '',
  },
  '/admin/resources/tool/tool/settings/': {},
  '/admin/resources/vuln/settings/': {},
  '/admin/system/active/status/': {
    status: 0,
    url: 'https://license.example.test',
    device_id: 'mock-device',
    expire_time: '',
  },
  '/front/user/learning_guide/statistics/': {
    status: 1,
    data: { day: 12, learn_duration: 3, recent_course: null },
  },
  '/front/user/recommend/resource/': {
    status: 1,
    data: {
      learning_route: [{ id: 'route-1', name: '模拟安全学习路线' }],
      practical_operation: {
        subject_operate: [{ id: 'subject-1', name: '模拟场景实操' }],
        test_operate: [{ id: 'test-1', name: '模拟 CTF 练习' }],
      },
      course: [
        {
          id: 'course-1',
          name: '模拟网络基础',
          image: '',
          type: 1,
          progress: '25%',
          difficulty: 2,
        },
      ],
    },
  },
  '/front/user/recommend/config/': {
    status: 1,
    data: {
      position: 5,
      direction: 5,
      learning_content: 5,
      knowledge_system_width: 5,
      knowledge_system_depth: 5,
      failed_skills: 5,
    },
  },
}
