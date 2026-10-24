import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/modes',
  testMatch: 's11-detection.spec.ts',
  retries: 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4195',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4195 --strictPort',
    url: 'http://127.0.0.1:4195',
    reuseExistingServer: false,
    env: {
      VITE_ENABLE_MSW: 'false',
      VITE_API_BASE_URL: '/api',
      LOCAL_API_TARGET: '',
      LOCAL_API_BASIC_AUTH: '',
      LOCAL_VITE_CACHE_DIR: 'node_modules/.vite-s11-isolated',
    },
  },
})
