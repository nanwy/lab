import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect } from 'react'
import { ApiError } from '../api'
import { clearSession } from './session'

export function useAccessFailure() {
  const navigate = useNavigate()
  const client = useQueryClient()
  return useCallback(
    (error: unknown) => {
      if (!(error instanceof ApiError) || error.status !== 403) return false
      if (error.serviceError === 'unauthenticated') {
        clearSession(client)
        void navigate({
          to: '/login',
          search: { reason: 'expired' },
          replace: true,
        })
      } else if (error.serviceError === 'inactive') {
        void navigate({ to: '/activate', replace: true })
      } else if (error.serviceError === 'forbidden') {
        void navigate({ to: '/forbidden', replace: true })
      } else return false
      return true
    },
    [client, navigate],
  )
}

/** 所有 Query 读取共用权限分支；命令请求在调用处使用同一个处理函数。 */
export function AccessEvents() {
  const client = useQueryClient()
  const handle = useAccessFailure()
  useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        if (event.type === 'updated' && event.action.type === 'error')
          handle(event.query.state.error)
      }),
    [client, handle],
  )
  return null
}

export function ForbiddenPage() {
  return (
    <main className="grid min-h-screen place-content-center gap-5 bg-background p-8 text-foreground">
      <p className="text-sm text-muted-foreground">403</p>
      <h1 className="text-3xl font-semibold">您无权访问</h1>
      <p>当前账号没有此资源的访问权限，会话仍保留。</p>
      <Link className="text-primary underline" to="/">
        返回首页
      </Link>
      <p className="text-sm text-muted-foreground">
        如需访问此资源，请联系平台管理员。
      </p>
    </main>
  )
}
