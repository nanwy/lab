import {
  Link,
  Outlet,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  useBlocker,
  useRouterState,
  type ErrorComponentProps,
  type RouterHistory,
} from '@tanstack/react-router'
import { useState } from 'react'

import { can, mockIdentity } from './identity'
import { DiagnosticsPage } from './diagnostics-page'
import { DataDiagnosticsPage } from './data-diagnostics'
import { TopologyPage } from './topology/TopologyPage'
import { ExperimentTopologyPage } from './topology/ExperimentTopologyPage'
import { appConfig } from './config'
import { queryClient } from './query-client'
import { diagnosticQueryOptions } from './query-options'
import { LoginPage, type LoginReason } from './auth/LoginPage'
import { PersonalPage } from './auth/PersonalPage'
import { ActivatePage } from './auth/ActivatePage'
import { ForbiddenPage } from './auth/access'
import { ProtectedShell } from './portal/ProtectedShell'
import { HomePage } from './portal/HomePage'
import { PlatformBranding } from './portal/PlatformBranding'
import { navigation } from './portal/navigation'
import { ExperimentList } from './experiments/ExperimentList'
import {
  ExperimentLayout,
  ExperimentOverview,
  ExperimentExplanation,
} from './experiments/ExperimentContext'

function RootLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname })
  const business =
    path === '/' ||
    path === '/login' ||
    path === '/activate' ||
    path === '/forbidden' ||
    path === '/basic' ||
    path.startsWith('/basic/')
  return (
    <>
      {business ? <PlatformBranding /> : null}
      <AppShell />
    </>
  )
}

function AppShell() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  if (
    !['/overview', '/resources', '/draft', '/topology', '/diagnostics'].some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  )
    return <Outlet />

  return (
    <div className="site-shell">
      <header className="site-header">
        <div>
          <p className="eyebrow">工程初始化</p>
          <Link className="brand" to="/overview">
            学员端统一前端
          </Link>
        </div>
        <div className="identity" aria-label="当前模拟身份">
          <span>{mockIdentity.displayName}</span>
          <small>确定性模拟账号</small>
        </div>
      </header>

      <div className="site-body">
        <nav className="site-nav" aria-label="主导航">
          {can(mockIdentity, 'overview:view') ? (
            <Link to="/overview" activeProps={{ 'aria-current': 'page' }}>
              工程概览
            </Link>
          ) : null}
          {can(mockIdentity, 'resources:view') ? (
            <>
              <Link to="/resources" activeProps={{ 'aria-current': 'page' }}>
                资源样例
              </Link>
              <Link
                to="/diagnostics/api"
                activeProps={{ 'aria-current': 'page' }}
              >
                接口诊断
              </Link>
              <Link
                to="/diagnostics/data"
                activeProps={{ 'aria-current': 'page' }}
              >
                表格与表单诊断
              </Link>
            </>
          ) : null}
          {can(mockIdentity, 'drafts:edit') ? (
            <Link to="/draft" activeProps={{ 'aria-current': 'page' }}>
              导航阻止示例
            </Link>
          ) : null}
          {can(mockIdentity, 'topology:view') ? (
            <Link to="/topology" activeProps={{ 'aria-current': 'page' }}>
              拓扑适配验证
            </Link>
          ) : null}
          {can(mockIdentity, 'diagnostics:view') ? (
            <Link to="/diagnostics/error">诊断工具</Link>
          ) : null}
        </nav>

        <main className="content-panel">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function OverviewPage() {
  return (
    <section>
      <p className="eyebrow">Infrastructure preview</p>
      <h1>工程概览</h1>
      <p>
        这里验证统一布局、hash
        路由和能力入口。它不是登录、实验台或课程等正式业务页面。
      </p>
      <div className="notice" role="note">
        当前身份仅包含可重复验证的模拟能力，不会触发真实写入。
      </div>
    </section>
  )
}

function ResourcesPage() {
  return (
    <section>
      <p className="eyebrow">Typed navigation</p>
      <h1>资源样例</h1>
      <p>示例入口仅用于验证类型化路径参数和查询条件。</p>
      <Link
        className="card-link"
        to="/resources/$resourceId"
        params={{ resourceId: 'lab-101' }}
        search={{ tab: 'activity' }}
      >
        打开 lab-101 的活动记录
      </Link>
    </section>
  )
}

type ResourceSearch = {
  tab: 'summary' | 'activity'
}

function parseResourceSearch(search: Record<string, unknown>): ResourceSearch {
  return {
    tab: search.tab === 'activity' ? 'activity' : 'summary',
  }
}

function ResourcePage() {
  const { resourceId } = resourceRoute.useParams()
  const { tab } = resourceRoute.useSearch()

  return (
    <section>
      <p className="eyebrow">Infrastructure preview</p>
      <h1>资源 {resourceId}</h1>
      <p>当前视图：{tab === 'activity' ? '活动记录' : '摘要'}</p>
      <div className="tab-list" aria-label="资源视图">
        <Link
          to="/resources/$resourceId"
          params={{ resourceId }}
          search={{ tab: 'summary' }}
        >
          摘要
        </Link>
        <Link
          to="/resources/$resourceId"
          params={{ resourceId }}
          search={{ tab: 'activity' }}
        >
          活动记录
        </Link>
      </div>
    </section>
  )
}

function DraftPage() {
  const [content, setContent] = useState('')
  const blocker = useBlocker({
    shouldBlockFn: () => content.length > 0,
    enableBeforeUnload: content.length > 0,
    withResolver: true,
  })

  return (
    <section>
      <p className="eyebrow">Navigation safety</p>
      <h1>导航阻止示例</h1>
      <p>输入内容后离开，应用会先让用户确认；该草稿不会保存或发送。</p>
      <label className="field">
        <span>草稿内容</span>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={6}
        />
      </label>
      <Link className="button-link" to="/overview">
        返回概览
      </Link>

      {blocker.status === 'blocked' ? (
        <div className="dialog-backdrop">
          <section
            className="dialog"
            role="alertdialog"
            aria-labelledby="leave-title"
          >
            <h2 id="leave-title">放弃未保存的修改？</h2>
            <p>继续离开会清除当前示例草稿。</p>
            <div className="dialog-actions">
              <button type="button" onClick={blocker.reset}>
                留在这里
              </button>
              <button
                type="button"
                className="danger"
                onClick={blocker.proceed}
              >
                继续离开
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}

function RouteError({ reset }: ErrorComponentProps) {
  return (
    <section className="error-state" role="alert">
      <p className="eyebrow">Route error</p>
      <h1>页面暂时无法显示</h1>
      <p>路由边界已接管这次错误，其他入口仍然可以使用。</p>
      <div className="error-actions">
        <button type="button" onClick={reset}>
          重试
        </button>
        <Link to="/overview">返回工程概览</Link>
      </div>
    </section>
  )
}

function NotFoundPage() {
  return (
    <section className="mx-auto max-w-xl space-y-5 p-8">
      <p className="eyebrow">404</p>
      <h1>没有找到这个入口</h1>
      <p>请检查 hash 深链，或返回首页继续。</p>
      <Link to="/">返回首页</Link>
    </section>
  )
}

const rootRoute = createRootRoute({
  component: RootLayout,
  errorComponent: RouteError,
  notFoundComponent: NotFoundPage,
})

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/overview',
  component: OverviewPage,
})

type LoginSearch = {
  reason?: LoginReason
}

function parseLoginSearch(search: Record<string, unknown>): LoginSearch {
  return {
    reason:
      search.reason === 'expired' ||
      search.reason === 'signed-out' ||
      search.reason === 'password-changed'
        ? search.reason
        : undefined,
  }
}

function LoginRoutePage() {
  const { reason } = loginRoute.useSearch()
  return <LoginPage reason={reason} />
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: parseLoginSearch,
  component: LoginRoutePage,
})

const entryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <Navigate to="/login" replace />,
})
const activationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activate',
  component: ActivatePage,
})
const forbiddenRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forbidden',
  component: ForbiddenPage,
})
const basicRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/basic',
  component: ProtectedShell,
})
const basicIndexRoute = createRoute({
  getParentRoute: () => basicRoute,
  path: '/',
  component: () => <Navigate to="/basic/home" replace />,
})
const futureRoute = createRoute({
  getParentRoute: () => basicRoute,
  path: '$',
  component: FutureBusinessPage,
})

function FutureBusinessPage() {
  const { _splat = '' } = futureRoute.useParams()
  if (_splat === 'training/task')
    return (
      <Navigate to="/basic/$" params={{ _splat: 'training/task/1' }} replace />
    )
  const path = `/basic/${_splat}`
  const item = navigation
    .flatMap((group) => [...group.items])
    .find((item) => path === item.path || path.startsWith(`${item.path}/`))
  if (!item) return <NotFoundPage />
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{item?.name ?? '个人中心'}</h1>
      <p role="note">
        此业务页面属于后续实施切片，尚未实现。当前只验证应用导航和访问守卫，不代表业务可用。
      </p>
      <Link className="text-primary underline" to="/basic/home">
        返回首页
      </Link>
    </section>
  )
}

const sessionHomeRoute = createRoute({
  getParentRoute: () => basicRoute,
  path: '/home',
  component: HomePage,
})

const personalRoute = createRoute({
  getParentRoute: () => basicRoute,
  path: '/personal/$type',
  component: () => {
    const { type } = personalRoute.useParams()
    if (
      type !== 'info' &&
      type !== 'enshrine' &&
      type !== 'message' &&
      type !== 'resource'
    )
      return <NotFoundPage />
    return <PersonalPage type={type} />
  },
})

const resourcesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources',
  component: ResourcesPage,
})

const experimentListRoute = createRoute({
  getParentRoute: () => basicRoute,
  path: '/user/bench',
  component: ExperimentList,
})

const experimentRoute = createRoute({
  getParentRoute: () => basicRoute,
  path: '/user/bench/experiment/$id',
  component: () => {
    const { id } = experimentRoute.useParams()
    return <ExperimentLayout key={id} id={id} />
  },
})
const experimentIndexRoute = createRoute({
  getParentRoute: () => experimentRoute,
  path: '/',
  component: () => {
    const { id } = experimentRoute.useParams()
    return (
      <Navigate
        to="/basic/user/bench/experiment/$id/overview"
        params={{ id }}
        replace
      />
    )
  },
})
const experimentOverviewRoute = createRoute({
  getParentRoute: () => experimentRoute,
  path: '/overview',
  component: ExperimentOverview,
})
const experimentExplanationRoute = createRoute({
  getParentRoute: () => experimentRoute,
  path: '/explain',
  component: ExperimentExplanation,
})
const experimentFutureRoute = createRoute({
  getParentRoute: () => experimentRoute,
  path: '$',
  component: () => {
    const { _splat } = experimentFutureRoute.useParams()
    if (
      ![
        'simulate',
        'flow',
        'notes',
        'detection/penetration',
        'detection/defense',
        'detection/baseline',
        'detection/vulnerability',
        'detection/riskAssessment',
        'attackteaching',
      ].includes(_splat ?? '')
    )
      return <NotFoundPage />
    return <p role="note">此实验子页属于后续实施切片，尚未实现。</p>
  },
})

const experimentSceneRoute = createRoute({
  getParentRoute: () => experimentRoute,
  path: '/scene',
  component: ExperimentTopologyPage,
})

const resourceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/resources/$resourceId',
  validateSearch: parseResourceSearch,
  component: ResourcePage,
})

const draftRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/draft',
  component: DraftPage,
})

const topologyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/topology',
  component: TopologyPage,
})

const diagnosticErrorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/diagnostics/error',
  loader: () => {
    throw new Error('Deterministic route-boundary demonstration')
  },
  component: () => null,
})

const apiDiagnosticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/diagnostics/api',
  loader: () =>
    appConfig.mockEnabled
      ? queryClient.ensureQueryData(diagnosticQueryOptions('success'))
      : undefined,
  component: DiagnosticsPage,
})

const dataDiagnosticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/diagnostics/data',
  component: DataDiagnosticsPage,
})

const routeTree = rootRoute.addChildren([
  overviewRoute,
  entryRoute,
  loginRoute,
  activationRoute,
  forbiddenRoute,
  basicRoute.addChildren([
    basicIndexRoute,
    sessionHomeRoute,
    personalRoute,
    experimentListRoute,
    experimentRoute.addChildren([
      experimentIndexRoute,
      experimentOverviewRoute,
      experimentExplanationRoute,
      experimentSceneRoute,
      experimentFutureRoute,
    ]),
    futureRoute,
  ]),
  resourcesRoute,
  resourceRoute,
  draftRoute,
  apiDiagnosticsRoute,
  dataDiagnosticsRoute,
  topologyRoute,
  diagnosticErrorRoute,
])

export function createAppRouter(history: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })
}

export const router = createAppRouter(createHashHistory())

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
