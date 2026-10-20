import { defineConfig } from '@playwright/test'
import modes from './playwright.modes.config'

// 专项回归只启动选定的一个隔离服务，默认关闭 MSW；配置复用正式模式定义。
const projectName = process.env.PLAYWRIGHT_FOCUSED_PROJECT ?? 'mock-disabled'
const project = modes.projects?.find((p) => p.name === projectName)
const servers = Array.isArray(modes.webServer)
  ? modes.webServer
  : [modes.webServer]
const server = servers.find((s) => s?.url === project?.use?.baseURL)
if (!project || !server) throw new Error(`缺少 ${projectName} 专项测试配置`)

export default defineConfig({
  ...modes,
  projects: [project],
  webServer: server,
})
