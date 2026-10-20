export type RequestPolicyContext = {
  headers: Headers
  method: string
  url: URL
}

export type RequestPolicy = {
  apply(context: RequestPolicyContext): void | Promise<void>
}

export type ResponseKind = 'json' | 'empty' | 'text' | 'blob' | 'stream'

export type ErrorDisplayPolicy = {
  serviceErrors?: Readonly<Record<string, string>>
}

export type RequestOptions = Omit<RequestInit, 'body' | 'signal'> & {
  json?: unknown
  body?: BodyInit | null
  response?: ResponseKind
  signal?: AbortSignal
  timeoutMs?: number
  errorDisplay?: ErrorDisplayPolicy
  isBusinessFailure?: (value: unknown) => boolean
  allowExpiredSession?: boolean
}

export type ApiErrorKind =
  'http' | 'business' | 'cancelled' | 'timeout' | 'network' | 'invalid-response'

export class ApiError extends Error {
  handled = false
  readonly serviceError?: string
  readonly kind: ApiErrorKind
  readonly status?: number

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: {
      serviceError?: string
      status?: number
    } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.serviceError = options.serviceError
    this.kind = kind
    this.status = options.status
  }
}

type ApiClientOptions = {
  baseUrl: string
  requestPolicy?: RequestPolicy
  fetch?: typeof globalThis.fetch
  onError?: (error: unknown, request: RequestOptions) => void
}

function buildUrl(baseUrl: string, path: string) {
  const origin = globalThis.location?.origin ?? 'http://localhost'
  const resolvedBase = new URL(baseUrl, origin)
  return new URL(
    path.replace(/^\//, ''),
    `${resolvedBase.href.replace(/\/$/, '')}/`,
  )
}

function combineSignals(
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined,
) {
  const signals = [signal]
  if (timeoutMs !== undefined) signals.push(AbortSignal.timeout(timeoutMs))
  const active = signals.filter(
    (item): item is AbortSignal => item !== undefined,
  )
  return active.length === 0 ? undefined : AbortSignal.any(active)
}

function serviceErrorValue(value: unknown, policy?: ErrorDisplayPolicy) {
  if (!value || typeof value !== 'object') return undefined
  const code = Reflect.get(value, 'error')
  const approved = policy?.serviceErrors
  return typeof code === 'string' && approved && Object.hasOwn(approved, code)
    ? approved[code]
    : undefined
}

function messageFrom(
  value: unknown,
  field: 'error' | 'message',
  fallback: string,
) {
  if (!value || typeof value !== 'object') return fallback
  const message = Reflect.get(value, field)
  if (typeof message !== 'string' || !message.trim()) return fallback
  return message
}

async function readErrorBody(
  response: Response,
  signal: AbortSignal | undefined,
) {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('json')) return undefined
  try {
    return (await response.json()) as unknown
  } catch {
    const normalizedAbort = abortError(signal)
    if (normalizedAbort) throw normalizedAbort
    return undefined
  }
}

async function parseResponse(
  response: Response,
  kind: ResponseKind,
  signal?: AbortSignal,
  onError?: (error: unknown) => void,
) {
  if (kind === 'empty') return undefined
  if (kind === 'text') return response.text()
  if (kind === 'blob') return response.blob()
  if (kind === 'stream') {
    if (!response.body) {
      throw new ApiError('invalid-response', '响应没有可读取的数据流', {
        status: response.status,
      })
    }
    const reader = response.body.getReader()
    let finished = false
    let onAbort: (() => void) | undefined
    const cleanup = () => {
      finished = true
      if (onAbort) signal?.removeEventListener('abort', onAbort)
    }
    return new ReadableStream<Uint8Array>({
      start(controller) {
        onAbort = () => {
          if (finished) return
          cleanup()
          const error = abortError(signal)
          onError?.(error)
          controller.error(error)
          void reader.cancel().catch(() => {})
        }
        signal?.addEventListener('abort', onAbort, { once: true })
        if (signal?.aborted) onAbort()
      },
      async pull(controller) {
        if (finished) return
        try {
          const result = await reader.read()
          if (finished) return
          if (result.done) {
            cleanup()
            controller.close()
          } else controller.enqueue(result.value)
        } catch {
          if (finished) return
          cleanup()
          const error =
            abortError(signal) ??
            new ApiError('network', '读取响应流失败', {
              status: response.status,
            })
          onError?.(error)
          controller.error(error)
        }
      },
      async cancel() {
        cleanup()
        await reader.cancel().catch(() => {})
      },
    })
  }

  if (
    response.status === 204 ||
    response.headers.get('content-length') === '0'
  ) {
    return null
  }
  try {
    return (await response.json()) as unknown
  } catch {
    throw new ApiError('invalid-response', '响应不是有效的 JSON', {
      status: response.status,
    })
  }
}

function abortError(signal: AbortSignal | undefined) {
  if (!signal?.aborted) return undefined
  const timedOut =
    signal.reason instanceof DOMException &&
    signal.reason.name === 'TimeoutError'
  return new ApiError(
    timedOut ? 'timeout' : 'cancelled',
    timedOut ? '请求超时' : '请求已取消',
  )
}

export function createApiClient(options: ApiClientOptions) {
  async function request<T>(
    path: string,
    request: RequestOptions = {},
  ): Promise<T> {
    const url = buildUrl(options.baseUrl, path)
    const method = request.method?.toUpperCase() ?? 'GET'
    const headers = new Headers(request.headers)
    let body = request.body

    if (request.json !== undefined) {
      headers.set('content-type', 'application/json')
      body = JSON.stringify(request.json)
    }

    await options.requestPolicy?.apply({ headers, method, url })
    const signal = combineSignals(request.signal, request.timeoutMs)

    let response: Response
    try {
      response = await (options.fetch ?? globalThis.fetch)(url, {
        ...request,
        method,
        headers,
        body,
        signal,
      })
    } catch {
      const normalizedAbort = abortError(signal)
      if (normalizedAbort) throw normalizedAbort
      throw new ApiError('network', '网络请求失败')
    }

    if (!response.ok) {
      const errorBody = await readErrorBody(response, signal)
      throw new ApiError(
        'http',
        messageFrom(errorBody, 'error', `请求失败（${response.status}）`),
        {
          serviceError: serviceErrorValue(errorBody, request.errorDisplay),
          status: response.status,
        },
      )
    }

    let result: unknown
    try {
      result = await parseResponse(
        response,
        request.response ?? 'json',
        signal,
        (error) => options.onError?.(error, request),
      )
    } catch (cause) {
      throw (
        abortError(signal) ??
        (cause instanceof ApiError
          ? cause
          : new ApiError('network', '读取响应失败', {
              status: response.status,
            }))
      )
    }
    if (request.isBusinessFailure?.(result)) {
      throw new ApiError(
        'business',
        messageFrom(result, 'message', '业务请求失败'),
        {
          status: response.status,
        },
      )
    }
    return result as T
  }
  return {
    async request<T>(
      path: string,
      requestOptions: RequestOptions = {},
    ): Promise<T> {
      try {
        return await request<T>(path, requestOptions)
      } catch (error) {
        options.onError?.(error, requestOptions)
        throw error
      }
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
