import { Link } from '@tanstack/react-router'

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
