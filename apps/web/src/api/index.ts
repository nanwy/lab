import { createApiClient } from './client'
import { appConfig } from '../config'

// Authentication and CSRF policy belongs behind this adapter. Its concrete
// names and values stay empty until the original service contract is verified.
export const apiClient = createApiClient({
  baseUrl: appConfig.apiBaseUrl,
  requestPolicy: {
    apply() {},
  },
})

export { ApiError } from './client'
