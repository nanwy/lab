import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Button } from '@workspace/ui/components/button'
import { getPlatformLogo } from '../api/portal'

export const platformLogoOptions = {
  queryKey: ['platform', 'logo'],
  queryFn: ({ signal }: { signal: AbortSignal }) => getPlatformLogo(signal),
  staleTime: 30_000,
  retry: false,
}
export function PlatformBranding() {
  const logo = useQuery(platformLogoOptions)
  useEffect(() => {
    document.title = logo.data?.platform_name || '网络安全攻防训练平台'
    const old = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    const icon = document.createElement('link')
    icon.rel = 'icon'
    if (logo.data?.icon) {
      icon.href = logo.data.icon
      old?.remove()
      document.head.append(icon)
    }
    return () => {
      icon.remove()
      if (old && !old.isConnected) document.head.append(old)
    }
  }, [logo.data])
  return logo.isError ? (
    <aside className="bg-muted px-5 py-2 text-sm" role="alert">
      平台标识读取失败。
      <Button variant="link" onClick={() => void logo.refetch()}>
        重试配置
      </Button>
    </aside>
  ) : null
}
