export type RequestPolicyContext = {
  headers: Headers
  method: string
  url: URL
}

export type RequestPolicy = {
  apply(context: RequestPolicyContext): void | Promise<void>
}

export type ResponseKind = 'json' | 'empty' | 'text' | 'blob' | 'stream'

export type RequestOptions = Omit<RequestInit, 'body' | 'signal'> & {
  json?: unknown
  body?: BodyInit | null
  response?: ResponseKind
  signal?: AbortSignal
  timeoutMs?: number
}

export type ApiErrorKind =
  'http' | 'business' | 'cancelled' | 'timeout' | 'network' | 'invalid-response'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  readonly fieldErrors?: Readonly<Record<string, string>>

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: {
      status?: number
      fieldErrors?: Readonly<Record<string, string>>
      cause?: unknown
    } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'ApiError'
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

function safeFieldErrors(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  const safe = Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
  return Object.keys(safe).length > 0 ? safe : undefined
}

function messageFrom(value: unknown, fallback: string) {
  if (!value || typeof value !== 'object') return fallback
  const message = Reflect.get(value, 'message')
  return typeof message === 'string' && message.trim() ? message : fallback
}

async function readErrorBody(
  response: Response,
  signal: AbortSignal | undefined,
) {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('json')) return undefined
  try {
    return (await response.json()) as unknown
  } catch (cause) {
    const normalizedAbort = abortError(cause, signal)
    if (normalizedAbort) throw normalizedAbort
    return undefined
  }
}

function isBusinessFailure(value: unknown) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (Reflect.get(value, 'success') === false ||
      Reflect.get(value, 'ok') === false),
  )
}

async function parseResponse(response: Response, kind: ResponseKind) {
  if (kind === 'empty') return undefined
  if (kind === 'text') return response.text()
  if (kind === 'blob') return response.blob()
  if (kind === 'stream') {
    if (!response.body) {
      throw new ApiError('invalid-response', '响应没有可读取的数据流', {
        status: response.status,
      })
    }
    return response.body
  }

  if (
    response.status === 204 ||
    response.headers.get('content-length') === '0'
  ) {
    return null
  }
  try {
    return (await response.json()) as unknown
  } catch (cause) {
    throw new ApiError('invalid-response', '响应不是有效的 JSON', {
      status: response.status,
      cause,
    })
  }
}

function abortError(error: unknown, signal: AbortSignal | undefined) {
  if (!signal?.aborted) return undefined
  const timedOut =
    signal.reason instanceof DOMException &&
    signal.reason.name === 'TimeoutError'
  return new ApiError(
    timedOut ? 'timeout' : 'cancelled',
    timedOut ? '请求超时' : '请求已取消',
    { cause: error },
  )
}

export function createApiClient(options: ApiClientOptions) {
  const fetcher = options.fetch ?? globalThis.fetch

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
        response = await fetcher(url, {
          ...request,
          method,
          headers,
          body,
          signal,
        })
      } catch (cause) {
        const normalizedAbort = abortError(cause, signal)
        if (normalizedAbort) throw normalizedAbort
        throw new ApiError('network', '网络请求失败', { cause })
      }

      if (!response.ok) {
        const errorBody = await readErrorBody(response, signal)
        throw new ApiError(
          'http',
          messageFrom(errorBody, `请求失败（${response.status}）`),
          {
            status: response.status,
            fieldErrors: safeFieldErrors(
              errorBody && typeof errorBody === 'object'
                ? Reflect.get(errorBody, 'fieldErrors')
                : undefined,
            ),
          },
        )
      }

      let result: unknown
      try {
        result = await parseResponse(response, request.response ?? 'json')
      } catch (cause) {
        throw abortError(cause, signal) ?? cause
      }
      if (isBusinessFailure(result)) {
        throw new ApiError('business', messageFrom(result, '业务请求失败'), {
          status: response.status,
          fieldErrors: safeFieldErrors(
            Reflect.get(result as object, 'fieldErrors'),
          ),
        })
      }
      return result as T
    },
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
