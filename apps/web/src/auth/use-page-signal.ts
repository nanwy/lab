import { useCallback, useEffect, useRef } from 'react'

/** 页面拥有命令请求；离页即取消，迟到结果不得更新会话或导航。 */
export function usePageSignal() {
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    const current = new AbortController()
    controller.current = current
    return () => current.abort()
  }, [])
  return useCallback(() => {
    if (!controller.current) throw new Error('页面尚未挂载')
    return controller.current.signal
  }, [])
}
