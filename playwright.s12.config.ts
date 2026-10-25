import { defineConfig, devices } from '@playwright/test'
const port = process.env.PLAYWRIGHT_S12_PORT ?? '4196'
const baseURL = `http://127.0.0.1:${port}`
export default defineConfig({
  outputDir: process.env.PLAYWRIGHT_S12_OUTPUT ?? 'test-results/s12',
  testDir: './tests/modes',
  testMatch: process.env.PLAYWRIGHT_S12_MATCH ?? 's12-*.spec.ts',
  retries: 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    env: {
      VITE_ENABLE_MSW: 'false',
      VITE_API_BASE_URL: '/api',
      LOCAL_API_TARGET: '',
      LOCAL_API_BASIC_AUTH: '',
      LOCAL_VITE_CACHE_DIR: 'node_modules/.vite-s12-isolated',
    },
  },
})
