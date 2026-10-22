import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/modes',
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  projects: [
    {
      name: 'production',
      testMatch: [
        'runtime.spec.ts',
        's02.spec.ts',
        's03.spec.ts',
        's04.spec.ts',
        's05.spec.ts',
        's06.spec.ts',
        's07.spec.ts',
        's07-resources.spec.ts',
        's07-terminal.spec.ts',
        'forms.spec.ts',
      ],
      use: { baseURL: 'http://127.0.0.1:4174' },
    },
    {
      name: 'mock-disabled',
      testMatch: [
        'runtime.spec.ts',
        's02.spec.ts',
        's03.spec.ts',
        's04.spec.ts',
        's05.spec.ts',
        's06.spec.ts',
        's07.spec.ts',
        's07-resources.spec.ts',
        's07-terminal.spec.ts',
        'forms.spec.ts',
      ],
      use: { baseURL: 'http://127.0.0.1:4175' },
    },
    {
      name: 'custom-api-mock',
      testMatch: 'custom-api.spec.ts',
      use: { baseURL: 'http://127.0.0.1:4176' },
    },
  ],
  webServer: [
    {
      command:
        'pnpm build && pnpm --filter @xueyuan/web exec vite preview --host 127.0.0.1 --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: false,
      env: {
        VITE_ENABLE_MSW: 'true',
        VITE_API_BASE_URL: '/api',
        LOCAL_API_TARGET: '',
        LOCAL_API_BASIC_AUTH: '',
        LOCAL_VITE_CACHE_DIR: 'node_modules/.vite-playwright-production',
      },
    },
    {
      command: 'pnpm dev --host 127.0.0.1 --port 4175 --strictPort',
      url: 'http://127.0.0.1:4175',
      reuseExistingServer: false,
      env: {
        VITE_ENABLE_MSW: 'false',
        VITE_API_BASE_URL: '/api',
        LOCAL_API_TARGET: '',
        LOCAL_API_BASIC_AUTH: '',
        LOCAL_VITE_CACHE_DIR: 'node_modules/.vite-playwright-mock-disabled',
      },
    },
    {
      command: 'pnpm dev --host 127.0.0.1 --port 4176 --strictPort',
      url: 'http://127.0.0.1:4176',
      reuseExistingServer: false,
      env: {
        VITE_ENABLE_MSW: 'true',
        VITE_API_BASE_URL: '/custom-api',
        LOCAL_API_TARGET: '',
        LOCAL_API_BASIC_AUTH: '',
        LOCAL_VITE_CACHE_DIR: 'node_modules/.vite-playwright-custom-api',
      },
    },
  ],
})
