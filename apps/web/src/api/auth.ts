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
const userExtensionSchema = z
  .object({
    first_entry: z.boolean().optional(),
    ai_app: z.union([z.string(), z.number()]).optional(),
    position: z.array(z.union([z.string(), z.number()])).optional(),
  })
  .catchall(z.unknown())
const currentUserSchema = z.object({
  id: z.union([z.string().min(1), z.number()]),
  username: z.string().optional(),
  realname: z.string().nullish(),
  unit: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().nullish(),
  logo: z.string().nullish(),
  job_number: z.string().nullish(),
  extend_info: userExtensionSchema.optional(),
})

export type CurrentUser = z.infer<typeof currentUserSchema>

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

export async function logout(
  signal?: AbortSignal,
  allowExpiredSession = false,
) {
  const value = await apiClient.request('/front/logout/', {
    signal,
    allowExpiredSession,
    isBusinessFailure: (result) =>
      !operationResultSchema.safeParse(result).success,
  })
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

export const profileFormSchema = z.object({
  realname: z.string().max(20, '姓名不能超过20个字符'),
  unit: z.string().max(32, '单位不能超过32个字符'),
  phone: z.string().max(11, '手机号不能超过11个字符'),
  email: z.string().max(100, '邮箱不能超过100个字符'),
  position: z.array(z.union([z.string(), z.number()])),
})
export type ProfileValues = z.infer<typeof profileFormSchema>
export function profileValues(user: CurrentUser): ProfileValues {
  return {
    realname: user.realname ?? '',
    unit: user.unit ?? '',
    phone: user.phone ?? '',
    email: user.email ?? '',
    position: user.extend_info?.position ?? [],
  }
}
export async function saveProfile(
  values: ProfileValues,
  extendInfo: CurrentUser['extend_info'],
  signal?: AbortSignal,
) {
  const { position, ...fields } = profileFormSchema.parse(values)
  return parseResponse(
    currentUserSchema,
    await apiClient.request('/front/user/info/', {
      method: 'PATCH',
      json: { ...fields, extend_info: { ...extendInfo, position } },
      signal,
    }),
  )
}
export const avatarFileSchema = z
  .instanceof(File)
  .refine((file) => file.size <= 5 * 1024 * 1024, '图片大小不能超过5M')
export async function uploadAvatar(file: File, signal?: AbortSignal) {
  const body = new FormData()
  body.append('logo', avatarFileSchema.parse(file))
  return parseResponse(
    currentUserSchema,
    await apiClient.request('/front/user/info/', {
      method: 'PATCH',
      body,
      signal,
    }),
  )
}
export const passwordChangeSchema = z.object({
  cipher: z.string().min(1, '请输入原始密码').max(100, '密码不能超过100个字符'),
  password: z.string().min(1, '请输入新密码').max(100, '密码不能超过100个字符'),
  confirm_password: z
    .string()
    .min(1, '请重复输入确认密码')
    .max(100, '密码不能超过100个字符'),
})
export type PasswordChangeValues = z.infer<typeof passwordChangeSchema>
export async function changePassword(
  values: PasswordChangeValues,
  signal?: AbortSignal,
) {
  const result = await apiClient.request('/front/user/password/', {
    method: 'POST',
    json: passwordChangeSchema.parse(values),
    signal,
    isBusinessFailure: (value) =>
      typeof value === 'object' &&
      value !== null &&
      Reflect.get(value, 'status') !== 1,
  })
  return parseResponse(operationResultSchema, result)
}
export async function getPersonalStatistics(signal?: AbortSignal) {
  const metric = z.union([z.number(), z.string()])
  return parseResponse(
    z.object({
      status: z.literal(1),
      data: z.object({
        login_day: metric,
        study_length: metric,
        finished_course: metric,
        finished_subject_scene: metric,
        finished_assessment: metric,
      }),
    }),
    await apiClient.request('/front/exam/ability_appraisa/study_situation/', {
      signal,
    }),
  ).data
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
