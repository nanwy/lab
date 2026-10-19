import { z } from 'zod'

import { ApiError, apiClient } from './index'
import { appConfig } from '../config'

export const loginCredentialsSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
  code: z.string().trim().min(1, '请输入验证码'),
})

export type LoginCredentials = z.infer<typeof loginCredentialsSchema>

const operationResultSchema = z.object({ status: z.literal(1) })
const currentUserSchema = z.object({
  id: z.union([z.string().min(1), z.number()]),
  username: z.string().optional(),
  extend_info: z
    .object({
      first_entry: z.boolean().optional(),
      ai_app: z.union([z.string(), z.number()]).optional(),
      position: z.array(z.union([z.string(), z.number()])).optional(),
    })
    .optional(),
})

export type CurrentUser = z.infer<typeof currentUserSchema>

const loginErrorDisplay = {
  fieldErrorSource: 'root',
  fieldErrors: {
    username: {
      用户名不存在: '用户名不存在',
    },
    password: {
      用户名或密码错误: '用户名或密码错误',
    },
    code: {
      验证码错误: '验证码错误',
    },
  },
} as const

function parseResponse<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new ApiError('invalid-response', '服务响应不符合账号契约')
  }
  return parsed.data
}

export async function login(
  credentials: LoginCredentials,
  signal?: AbortSignal,
) {
  const value = await apiClient.request('/front/login/', {
    method: 'POST',
    json: loginCredentialsSchema.parse(credentials),
    signal,
    errorDisplay: loginErrorDisplay,
    isBusinessFailure: (result) =>
      typeof result === 'object' &&
      result !== null &&
      Reflect.get(result, 'status') !== 1,
  })
  return parseResponse(operationResultSchema, value)
}

export async function getCurrentUser(signal?: AbortSignal) {
  const value = await apiClient.request('/front/user/info/', {
    signal,
  })
  return parseResponse(currentUserSchema, value)
}

export async function getLoginBackground(signal?: AbortSignal) {
  const value = await apiClient.request('/admin/system/background/', { signal })
  return parseResponse(z.object({ front_background: z.string() }), value)
}

export async function logout(signal?: AbortSignal) {
  const value = await apiClient.request('/front/logout/', { signal })
  return parseResponse(operationResultSchema, value)
}

export async function getPositions(signal?: AbortSignal) {
  return parseResponse(
    z.array(
      z.object({ id: z.union([z.string(), z.number()]), name: z.string() }),
    ),
    await apiClient.request('/front/position/?nopage=1', { signal }),
  )
}

export const initialPositionSchema = z.object({
  ai_app: z.union([z.string(), z.number()]),
  position: z.array(z.union([z.string(), z.number()])),
})

export async function saveInitialPosition(
  extendInfo: z.infer<typeof initialPositionSchema>,
  signal?: AbortSignal,
) {
  return parseResponse(
    currentUserSchema,
    await apiClient.request('/front/user/info/', {
      method: 'PATCH',
      json: {
        extend_info: {
          ...initialPositionSchema.parse(extendInfo),
          first_entry: true,
        },
        editType: 1,
      },
      signal,
    }),
  )
}

export function captchaUrl(version: number) {
  return `${appConfig.apiBaseUrl}/captcha/?time=${version}`
}

export function isSessionExpired(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    error.serviceError === 'unauthenticated'
  )
}
