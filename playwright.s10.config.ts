import { defineConfig, devices } from '@playwright/test'
const port = process.env.PLAYWRIGHT_S10_PORT ?? '4194'
export default defineConfig({
  testDir: './tests/modes',
  testMatch: /s10-.*\.spec\.ts/,
  fullyParallel: false,
  reporter: 'list',
  outputDir: process.env.PLAYWRIGHT_S10_OUTPUT ?? '/tmp/s10-01-results',
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  projects: [{ name: 's10', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: {
      VITE_ENABLE_MSW: 'false',
      VITE_API_BASE_URL: '/api',
      LOCAL_API_TARGET: '',
      LOCAL_API_BASIC_AUTH: '',
    },
  },
})
