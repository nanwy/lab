import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/modes',
  testMatch: 's10-content.spec.ts',
  fullyParallel: false,
  reporter: 'list',
  outputDir: '/tmp/s10-01-results',
  use: { baseURL: 'http://127.0.0.1:4194', trace: 'retain-on-failure' },
  projects: [{ name: 's10', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4194 --strictPort',
    url: 'http://127.0.0.1:4194',
    reuseExistingServer: false,
    env: {
      VITE_ENABLE_MSW: 'false',
      VITE_API_BASE_URL: '/api',
      LOCAL_API_TARGET: '',
      LOCAL_API_BASIC_AUTH: '',
    },
  },
})
