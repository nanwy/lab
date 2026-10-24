import { createContext, useContext, useState, type ReactNode } from 'react'

const DetectionTabsContext = createContext<{
  tab: string
  setTab: (tab: string) => void
} | null>(null)

/** 位于按路径重挂载的弹窗Provider之外，仅保留同一实验的检测页签。 */
export function DetectionTabsProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState('info')
  return (
    <DetectionTabsContext.Provider value={{ tab, setTab }}>
      {children}
    </DetectionTabsContext.Provider>
  )
}

export function useDetectionTabs() {
  const tabs = useContext(DetectionTabsContext)
  if (!tabs) throw new Error('检测页面缺少页签上下文')
  return tabs
}
