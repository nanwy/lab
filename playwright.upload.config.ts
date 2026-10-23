import { defineConfig } from '@playwright/test'
import modes from './playwright.modes.config'

// 传输测试需要 Vite 的源码模块和真实本地 HTTP 服务，不能使用生产预览。
const port = Number(process.env.PLAYWRIGHT_UPLOAD_PORT ?? 4193)
const apiPort = Number(process.env.PLAYWRIGHT_UPLOAD_API_PORT ?? 4293)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  ...modes,
  outputDir: 'test-results/s09-upload',
  workers: 1,
  projects: [
    {
      name: 'upload-transport',
      testMatch: 's09-upload.spec.ts',
      use: { baseURL },
    },
  ],
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    env: {
      VITE_ENABLE_MSW: 'false',
      VITE_API_BASE_URL: '/api',
      LOCAL_API_TARGET: `http://127.0.0.1:${apiPort}`,
      LOCAL_API_BASIC_AUTH: '',
      LOCAL_VITE_CACHE_DIR: `node_modules/.vite-playwright-upload-${port}`,
    },
  },
})
