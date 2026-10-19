import { createApiClient } from './client'

// Authentication and CSRF policy belongs behind this adapter. Its concrete
// names and values stay empty until the original service contract is verified.
export const apiClient = createApiClient({
  baseUrl: '/api',
  requestPolicy: {
    apply() {},
  },
})

export { ApiError } from './client'
