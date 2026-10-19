import { describe, expect, it } from 'vitest'

import { readAppConfig } from './config'

describe('应用环境契约', () => {
  it('开发默认模拟，生产即使显式开启也不启用模拟', () => {
    expect(readAppConfig({ DEV: true }).mockEnabled).toBe(true)
    expect(
      readAppConfig({ DEV: true, VITE_ENABLE_MSW: 'false' }).mockEnabled,
    ).toBe(false)
    expect(
      readAppConfig({ DEV: false, VITE_ENABLE_MSW: 'true' }).mockEnabled,
    ).toBe(false)
    expect(readAppConfig({ DEV: true }).apiBaseUrl).toBe('/api')
    expect(
      readAppConfig({
        DEV: true,
        VITE_API_BASE_URL: 'https://example.test/api/',
      }).apiBaseUrl,
    ).toBe('https://example.test/api')
  })
  it('错误配置立即失败，不将拼写错误当成关闭或默认地址', () => {
    expect(() =>
      readAppConfig({ DEV: true, VITE_ENABLE_MSW: 'FALSE' }),
    ).toThrow('VITE_ENABLE_MSW')
    for (const value of [
      '',
      'api',
      '//example.test',
      'javascript:alert(1)',
      '/api?token=x',
    ]) {
      expect(() =>
        readAppConfig({ DEV: true, VITE_API_BASE_URL: value }),
      ).toThrow('VITE_API_BASE_URL')
    }
  })
})
