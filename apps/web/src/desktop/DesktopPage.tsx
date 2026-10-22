import { useEffect } from 'react'
import { validateDesktop, type DesktopType } from '../api/desktop'
import { DesktopSession } from './DesktopSession'
export function DesktopPage({
  type,
  id,
  name,
  fullscreen = false,
}: {
  type: string
  id: string
  name?: string
  fullscreen?: boolean
}) {
  useEffect(() => {
    if (!name) return
    const previous = document.title
    document.title = name
    return () => {
      document.title = previous
    }
  }, [name])
  try {
    validateDesktop(type, id)
  } catch (error) {
    return <p role="alert">{(error as Error).message}</p>
  }
  return (
    <div className="h-screen" id={fullscreen ? 'manipulator-panel' : undefined}>
      <DesktopSession
        key={`${type}/${id}`}
        type={type as DesktopType}
        id={id}
        embedded={fullscreen}
      />
    </div>
  )
}
export function ControlPanelPage() {
  return (
    <p role="alert">
      操作机面板缺少任务、资源及操作详情上下文；独立路由的system/id不能确定这些参数，请从对应业务页面进入。
    </p>
  )
}
