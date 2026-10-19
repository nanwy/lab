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
  messages?: Readonly<Record<string, string>>
  fieldErrors?: Readonly<Record<string, Readonly<Record<string, string>>>>
  fieldErrorSource?: 'fieldErrors' | 'root'
}

export type RequestOptions = Omit<RequestInit, 'body' | 'signal'> & {
  json?: unknown
  body?: BodyInit | null
  response?: ResponseKind
  signal?: AbortSignal
  timeoutMs?: number
  errorDisplay?: ErrorDisplayPolicy
  isBusinessFailure?: (value: unknown) => boolean
}

export type ApiErrorKind =
  'http' | 'business' | 'cancelled' | 'timeout' | 'network' | 'invalid-response'

export class ApiError extends Error {
  readonly serviceError?: string
  readonly kind: ApiErrorKind
  readonly status?: number
  readonly fieldErrors?: Readonly<Record<string, string>>

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: {
      serviceError?: string
      status?: number
      fieldErrors?: Readonly<Record<string, string>>
    } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.serviceError = options.serviceError
    this.kind = kind
    this.status = options.status
    this.fieldErrors = options.fieldErrors
  }
}

type ApiClientOptions = {
  baseUrl: string
  requestPolicy?: RequestPolicy
  fetch?: typeof globalThis.fetch
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

function safeFieldErrors(value: unknown, policy?: ErrorDisplayPolicy) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  const safe = Object.fromEntries(
    Object.entries(value).flatMap(([key, message]) => {
      if (!policy?.fieldErrors || !Object.hasOwn(policy.fieldErrors, key))
        return []
      const approved = policy?.fieldErrors?.[key]
      return typeof message === 'string' &&
        approved &&
        Object.hasOwn(approved, message)
        ? [[key, approved[message]!]]
        : []
    }),
  )
  return Object.keys(safe).length > 0 ? safe : undefined
}

function fieldErrorValue(value: unknown, policy?: ErrorDisplayPolicy) {
  if (policy?.fieldErrorSource === 'root') return value
  return value && typeof value === 'object'
    ? Reflect.get(value, 'fieldErrors')
    : undefined
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
  fallback: string,
  policy?: ErrorDisplayPolicy,
) {
  if (!value || typeof value !== 'object') return fallback
  const message = Reflect.get(value, 'message')
  return typeof message === 'string' &&
    policy?.messages &&
    Object.hasOwn(policy.messages, message)
    ? policy.messages[message]!
    : fallback
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
          controller.error(abortError(signal))
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
          controller.error(
            abortError(signal) ??
              new ApiError('network', '读取响应流失败', {
                status: response.status,
              }),
          )
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
  return {
    async request<T>(path: string, request: RequestOptions = {}): Promise<T> {
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
          messageFrom(
            errorBody,
            `请求失败（${response.status}）`,
            request.errorDisplay,
          ),
          {
            serviceError: serviceErrorValue(errorBody, request.errorDisplay),
            status: response.status,
            fieldErrors: safeFieldErrors(
              fieldErrorValue(errorBody, request.errorDisplay),
              request.errorDisplay,
            ),
          },
        )
      }

      let result: unknown
      try {
        result = await parseResponse(
          response,
          request.response ?? 'json',
          signal,
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
          messageFrom(result, '业务请求失败', request.errorDisplay),
          {
            status: response.status,
            fieldErrors: safeFieldErrors(
              fieldErrorValue(result, request.errorDisplay),
              request.errorDisplay,
            ),
          },
        )
      }
      return result as T
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
