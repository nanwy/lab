import { queryOptions } from '@tanstack/react-query'

import { ApiError, apiClient } from './api'
import { getDiagnosticResult, type DiagnosticMode } from './api/diagnostics'

export function shouldRetryDiagnostic(failureCount: number, error: Error) {
  return (
    error instanceof ApiError && error.kind === 'network' && failureCount < 1
  )
}

export function diagnosticQueryOptions(mode: DiagnosticMode) {
  return queryOptions({
    queryKey: ['diagnostics', mode] as const,
    queryFn: ({ signal }) => getDiagnosticResult(apiClient, mode, signal),
    staleTime: 30_000,
    retry: shouldRetryDiagnostic,
  })
}
