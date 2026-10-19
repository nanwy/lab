import { queryOptions, type QueryClient } from '@tanstack/react-query'

import { getCurrentUser, type CurrentUser } from '../api/auth'

export const currentUserQueryKey = ['account', 'current-user'] as const

export function currentUserQueryOptions() {
  return queryOptions({
    queryKey: currentUserQueryKey,
    queryFn: ({ signal }) => getCurrentUser(signal),
    retry: false,
    staleTime: 30_000,
  })
}

export function establishSession(queryClient: QueryClient, user: CurrentUser) {
  queryClient.setQueryData(currentUserQueryKey, user)
}

export function clearSession(queryClient: QueryClient) {
  queryClient.clear()
  globalThis.localStorage?.removeItem('token')
}
