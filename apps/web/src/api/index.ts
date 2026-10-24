import { toast } from '@workspace/ui/components/sonner'
import { ApiError, createApiClient } from './client'
import { appConfig } from '../config'
import { queryClient } from '../query-client'
import { clearSession } from '../auth/session'

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
  onError(error, request) {
    if (!(error instanceof ApiError)) return
    error.handled = true
    if (error.kind === 'cancelled') return
    if (error.status === 403) {
      if (error.serviceError === 'unauthenticated') {
        if (request.allowExpiredSession) return
        clearSession(queryClient)
        globalThis.location?.replace('#/login?reason=expired')
        return
      }
      if (error.serviceError === 'inactive') {
        globalThis.location?.replace('#/activate')
        return
      }
      if (error.serviceError === 'forbidden') {
        globalThis.location?.replace('#/forbidden')
        return
      }
    }
    toast.error(error.message)
  },
  requestPolicy: {
    apply({ headers, method, authentication }) {
      const token = globalThis.localStorage?.getItem('token')
      if (token && authentication !== 'csrf-only')
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
