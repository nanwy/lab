import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from '@workspace/ui/components/sonner'
import { ApiError } from '../api'
import { Button } from '@workspace/ui/components/button'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { logout, type CurrentUser } from '../api/auth'
import { getResourceSettings } from '../api/portal'
import { clearSession, currentUserQueryOptions } from '../auth/session'
import { usePageSignal } from '../auth/use-page-signal'
import { navigation } from './navigation'
import { platformLogoOptions } from './PlatformBranding'
import { InitialPositionDialog } from './InitialPositionDialog'
import { PasswordDialog } from '../auth/PasswordDialog'
import NiceModal from '@ebay/nice-modal-react'
import { ActivityButtons } from '../activity/ActivityButtons'
import { OperationMachinesButton } from '../desktop/OperationMachines'
import { DetectionTabsProvider } from '../detection/DetectionTabs'

export function ProtectedShell() {
  const session = useQuery(currentUserQueryOptions())
  const client = useQueryClient()
  const navigate = useNavigate()
  const error = session.error
  useEffect(() => {
    if (!error) return
    // 已确认的激活/权限拒绝由统一客户端送往各自页面。
    if (
      error instanceof ApiError &&
      error.status === 403 &&
      (error.serviceError === 'inactive' || error.serviceError === 'forbidden')
    )
      return
    clearSession(client)
    void navigate({
      to: '/login',
      search: { reason: 'expired' },
      replace: true,
    })
  }, [client, error, navigate])
  if (session.isPending)
    return (
      <main className="p-10" role="status">
        正在恢复会话…
      </main>
    )
  if (session.isError)
    return (
      <main className="p-10" role="status">
        正在返回登录页…
      </main>
    )
  return <LearnerShell key={session.data.id} user={session.data} />
}

function LearnerShell({ user }: { user: CurrentUser }) {
  const logo = useQuery(platformLogoOptions)
  const settings = useQuery({
    queryKey: ['platform', 'resource-settings'],
    queryFn: ({ signal }) => getResourceSettings(signal),
    retry: false,
    staleTime: 30_000,
  })
  const [positionDismissed, setPositionDismissed] = useState(false)
  const [passwordPath, setPasswordPath] = useState<string | null>(null)
  const client = useQueryClient()
  const navigate = useNavigate()
  const pageSignal = usePageSignal()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  useEffect(() => {
    setPasswordPath(null)
  }, [pathname])
  async function signOut() {
    const signal = pageSignal()
    try {
      await logout(signal)
      if (signal.aborted) return
      clearSession(client)
      await navigate({
        to: '/login',
        search: { reason: 'signed-out' },
        replace: true,
      })
    } catch (error) {
      if (signal.aborted) return
      if (!(error instanceof ApiError) || !error.handled)
        toast.error(
          error instanceof ApiError ? error.message : '退出失败，请重试',
        )
    }
  }
  const content = (
    <NiceModal.Provider key={pathname}>
      <div className="min-h-screen bg-background text-foreground">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-card px-5 py-4 lg:px-10">
          <Link
            to="/basic/home"
            className="flex min-w-0 items-center gap-3 font-semibold"
          >
            {logo.data?.front_logo ? (
              <img
                src={logo.data.front_logo}
                alt="平台标识"
                className="h-9 max-w-40 object-contain"
              />
            ) : null}
            <span className="text-lg">
              {logo.data?.platform_name || '网络安全攻防训练平台'}
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <ActivityButtons />
            <OperationMachinesButton />
            <span>
              当前用户 ID：<strong>{String(user.id)}</strong>
            </span>
            <details className="relative">
              <summary className="cursor-pointer rounded-md border px-3 py-2">
                用户菜单
              </summary>
              <div className="absolute right-0 z-20 mt-2 grid min-w-40 gap-3 rounded-md border bg-popover p-4 text-popover-foreground shadow-lg">
                <Link to="/basic/personal/$type" params={{ type: 'info' }}>
                  个人中心
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPasswordPath(pathname)}
                >
                  修改密码
                </Button>
              </div>
            </details>
            <LoadingButton variant="outline" onClick={signOut}>
              退出登录
            </LoadingButton>
          </div>
        </header>
        <nav
          aria-label="学员主导航"
          className="flex flex-wrap gap-x-6 gap-y-3 border-b px-5 py-4 lg:px-10"
        >
          <Link to="/basic/home" activeProps={{ 'aria-current': 'page' }}>
            首页
          </Link>
          {navigation.map((group) => (
            <details key={group.name} className="relative">
              <summary className="cursor-pointer">{group.name}</summary>
              <div className="absolute left-0 z-10 mt-3 grid min-w-44 gap-3 rounded-md border bg-popover p-4 shadow-lg">
                {group.items.map((item) => (
                  <Link
                    key={item.path}
                    to={
                      item.path === '/basic/user/bench' ||
                      item.path === '/basic/user/file' ||
                      item.path === '/basic/user/note'
                        ? item.path
                        : '/basic/$'
                    }
                    params={
                      item.path === '/basic/user/bench' ||
                      item.path === '/basic/user/file' ||
                      item.path === '/basic/user/note'
                        ? {}
                        : { _splat: item.path.slice(7) }
                    }
                    aria-current={pathname === item.path ? 'page' : undefined}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </details>
          ))}
        </nav>
        {settings.isError ? (
          <aside className="px-5 py-3" role="alert">
            资源配置读取失败。
            <Button variant="link" onClick={() => void settings.refetch()}>
              重试资源配置
            </Button>
          </aside>
        ) : null}
        <main className="mx-auto max-w-7xl px-5 py-8 lg:px-10">
          <Outlet />
        </main>
        {passwordPath === pathname ? (
          <PasswordDialog close={() => setPasswordPath(null)} />
        ) : null}
        {!positionDismissed && !user.extend_info?.first_entry ? (
          <InitialPositionDialog
            user={user}
            close={() => setPositionDismissed(true)}
          />
        ) : null}
      </div>
    </NiceModal.Provider>
  )
  const detectionScope = pathname
    .match(/^\/basic\/user\/bench\/experiment\/[^/]+\/detection(?:\/|$)/)?.[0]
    .replace(/\/$/, '')
  return detectionScope ? (
    <DetectionTabsProvider key={detectionScope}>
      {content}
    </DetectionTabsProvider>
  ) : (
    content
  )
}
