import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError, apiClient } from './api'
import { getDiagnosticResult, type DiagnosticMode } from './api/diagnostics'

const MODES: Array<{ mode: DiagnosticMode; label: string }> = [
  { mode: 'success', label: '成功响应' },
  { mode: 'empty', label: '空数据' },
  { mode: 'http-error', label: 'HTTP 错误' },
  { mode: 'business-error', label: '业务错误' },
  { mode: 'slow', label: '可取消请求' },
  { mode: 'timeout', label: '请求超时' },
]

export function shouldRetryDiagnostic(failureCount: number, error: Error) {
  return error instanceof ApiError && error.kind === 'network' && failureCount < 1
}

function describeError(error: Error) {
  if (!(error instanceof ApiError)) return '未知错误 · 请求未完成'
  if (error.kind === 'http') return `HTTP ${error.status ?? '失败'} · ${error.message}`
  if (error.kind === 'business') return `业务失败 · ${error.message}`
  if (error.kind === 'timeout') return `超时 · ${error.message}`
  if (error.kind === 'cancelled') return `已取消 · ${error.message}`
  return `网络错误 · ${error.message}`
}

export function DiagnosticsPage() {
  const [mode, setMode] = useState<DiagnosticMode>('success')
  const [cancelled, setCancelled] = useState(false)
  const queryClient = useQueryClient()
  const queryKey = ['diagnostics', mode] as const
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getDiagnosticResult(apiClient, mode, signal),
    retry: shouldRetryDiagnostic,
  })

  function selectMode(nextMode: DiagnosticMode) {
    setCancelled(false)
    setMode(nextMode)
  }

  async function cancelCurrentRequest() {
    await queryClient.cancelQueries({ queryKey, exact: true })
    setCancelled(true)
  }

  return (
    <section>
      <p className="eyebrow">Fetch + Query diagnostics</p>
      <h1>接口状态诊断</h1>
      <p>
        这里使用确定性模拟响应验证统一客户端和 Query 状态，不会访问或写入真实业务数据。
      </p>

      <div className="diagnostic-controls" aria-label="模拟响应">
        {MODES.map((entry) => (
          <button
            key={entry.mode}
            type="button"
            aria-pressed={mode === entry.mode}
            onClick={() => selectMode(entry.mode)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="query-state" aria-live="polite">
        {cancelled ? (
          <p className="state-cancelled">请求已取消，可以选择其他响应继续验证。</p>
        ) : query.isPending ? (
          <p>正在读取模拟响应…</p>
        ) : query.isError ? (
          <div role="alert">
            <strong>{describeError(query.error)}</strong>
          </div>
        ) : query.data.items.length === 0 ? (
          <p>响应成功，但没有数据。</p>
        ) : (
          <ul>
            {query.data.items.map((item) => (
              <li key={item.id}>{item.label}</li>
            ))}
          </ul>
        )}
      </div>

      {mode === 'slow' && query.isFetching && !cancelled ? (
        <button type="button" className="danger" onClick={cancelCurrentRequest}>
          取消当前请求
        </button>
      ) : null}
    </section>
  )
}
