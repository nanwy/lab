import type { ApiClient } from './client'
import { ApiError } from './client'
import { z } from 'zod'

const diagnosticSchema = z.object({
  items: z.array(z.object({ id: z.string(), label: z.string() })),
})

export type DiagnosticMode =
  'success' | 'empty' | 'http-error' | 'business-error' | 'slow' | 'timeout'

export type DiagnosticResult = {
  items: Array<{ id: string; label: string }>
}

export async function getDiagnosticResult(
  client: ApiClient,
  mode: DiagnosticMode,
  signal?: AbortSignal,
) {
  const result = await client.request<unknown>(`/diagnostics?mode=${mode}`, {
    signal,
    timeoutMs: mode === 'timeout' ? 60 : undefined,
    isBusinessFailure: (value) =>
      Boolean(
        value &&
        typeof value === 'object' &&
        Reflect.get(value, 'success') === false,
      ),
  })
  const parsed = diagnosticSchema.safeParse(result)
  if (!parsed.success)
    throw new ApiError('invalid-response', '诊断响应不符合约定')
  return parsed.data
}
