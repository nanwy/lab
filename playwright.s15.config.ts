import { defineConfig } from '@playwright/test'
import focused from './playwright.focused.config'

export default defineConfig({
  ...focused,
  outputDir: 'test-results/s15',
  projects: focused.projects?.map((project) => ({
    ...project,
    testMatch: process.env.PLAYWRIGHT_S15_MATCH ?? 's15-*.spec.ts',
  })),
})
