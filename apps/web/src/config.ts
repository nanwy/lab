type AppEnvironment = {
  DEV: boolean
  VITE_API_BASE_URL?: string
  VITE_ENABLE_MSW?: string
}

export function readAppConfig(env: AppEnvironment) {
  if (
    env.VITE_ENABLE_MSW !== undefined &&
    env.VITE_ENABLE_MSW !== 'true' &&
    env.VITE_ENABLE_MSW !== 'false'
  ) {
    throw new Error('VITE_ENABLE_MSW 必须为 true 或 false')
  }
  const baseUrl =
    env.VITE_API_BASE_URL === undefined ? '/api' : env.VITE_API_BASE_URL
  let parsed: URL
  try {
    if (
      !(baseUrl.startsWith('/') && !baseUrl.startsWith('//')) &&
      !/^https?:\/\//.test(baseUrl)
    ) {
      throw new Error('地址必须为根相对路径或 HTTP(S) URL')
    }
    parsed = new URL(baseUrl, 'https://config.invalid')
    if (
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      baseUrl !== baseUrl.trim()
    ) {
      throw new Error('地址不能携带凭据、查询参数或片段')
    }
  } catch {
    throw new Error(
      'VITE_API_BASE_URL 必须为不含凭据、查询参数或片段的根相对路径或 HTTP(S) URL',
    )
  }
  return Object.freeze({
    apiBaseUrl: baseUrl.replace(/\/$/, ''),
    mockEnabled: env.DEV && env.VITE_ENABLE_MSW === 'true',
  })
}

export const appConfig = readAppConfig(import.meta.env)
