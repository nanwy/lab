export const navigation = [
  {
    name: '我的导航',
    items: [
      { name: '任务中心', path: '/basic/user/taskcenter' },
      { name: '学习路线', path: '/basic/user/studypath' },
      { name: '学情画像', path: '/basic/user/profile' },
      { name: '我的笔记', path: '/basic/user/note' },
      { name: '资源网盘', path: '/basic/user/file' },
    ],
  },
  {
    name: '安全课程',
    items: [
      { name: '课程中心', path: '/basic/training/course' },
      { name: '学习任务', path: '/basic/training/task/1' },
      { name: '积分排行', path: '/basic/training/leaderboard' },
    ],
  },
  {
    name: '攻防实操',
    items: [
      { name: '我的实验台', path: '/basic/user/bench' },
      { name: '场景实操', path: '/basic/training/subject' },
    ],
  },
  {
    name: '考核评估',
    items: [
      { name: '考核活动', path: '/basic/exam/test' },
      { name: '题目练习', path: '/basic/exam/practice' },
      { name: '统计中心', path: '/basic/exam/statistics' },
      { name: '成绩排行', path: '/basic/exam/rank' },
    ],
  },
] as const
