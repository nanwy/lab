import { defineConfig } from '@playwright/test'
import focused from './playwright.focused.config'

const server = focused.webServer
if (!server || Array.isArray(server)) throw new Error('缺少独立态势专项服务')
export default defineConfig({
  ...focused,
  webServer: { ...server, command: `${server.command} --mode test` },
  projects: focused.projects?.map((project) => ({
    ...project,
    testMatch: 's14-leading-situation.spec.ts',
  })),
})
