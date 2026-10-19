import type { ApiClient } from './client'

export type DiagnosticMode =
  | 'success'
  | 'empty'
  | 'http-error'
  | 'business-error'
  | 'slow'
  | 'timeout'

export type DiagnosticResult = {
  items: Array<{ id: string; label: string }>
}

export function getDiagnosticResult(
  client: ApiClient,
  mode: DiagnosticMode,
  signal?: AbortSignal,
) {
  return client.request<DiagnosticResult>(`/diagnostics?mode=${mode}`, {
    signal,
    timeoutMs: mode === 'timeout' ? 60 : undefined,
  })
}
