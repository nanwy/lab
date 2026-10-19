import { createApiClient } from './client'
import { appConfig } from '../config'

function readCookie(name: string) {
  if (typeof document === 'undefined') return undefined
  const prefix = `${encodeURIComponent(name)}=`
  const value = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length)
  return value === undefined ? undefined : decodeURIComponent(value)
}

const client = createApiClient({
  baseUrl: appConfig.apiBaseUrl,
  requestPolicy: {
    apply({ headers, method }) {
      const token = globalThis.localStorage?.getItem('token')
      if (token)
        headers.set('authorization', `Token ${encodeURIComponent(token)}`)

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const csrfToken = readCookie('csrftoken')
        if (csrfToken) headers.set('x-csrftoken', csrfToken)
      }
    },
  },
})

export const apiClient = {
  request<T>(path: string, options: import('./client').RequestOptions = {}) {
    return client.request<T>(path, {
      ...options,
      errorDisplay: {
        ...options.errorDisplay,
        serviceErrors: {
          未登录: 'unauthenticated',
          您无权访问: 'forbidden',
          未激活: 'inactive',
          ...options.errorDisplay?.serviceErrors,
        },
      },
    })
  },
}

export { ApiError } from './client'
