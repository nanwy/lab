import { z } from 'zod'
import { apiClient, ApiError } from './index'

const id = z.union([z.string().min(1), z.number()])
const count = z.number().int().nonnegative()
const noticeSchema = z.object({
  id,
  title: z.string(),
  pub_time: z.string(),
  is_read: z.boolean(),
})
export const todoSchema = z.object({
  id,
  content: z.string(),
  set_time: z.string(),
  if_finish: z.boolean(),
})
export const collectionSchema = z.object({
  id,
  attribute: z.number(),
  is_status: z.boolean(),
  object_id: id,
  extend_info: z.object({ name: z.string() }),
})
export type Todo = z.infer<typeof todoSchema>
export type Notice = z.infer<typeof noticeSchema>
export type Collection = z.infer<typeof collectionSchema>
export type ItemId = Todo['id']

async function read<T>(
  schema: z.ZodType<T>,
  path: string,
  signal?: AbortSignal,
) {
  const result = schema.safeParse(await apiClient.request(path, { signal }))
  if (!result.success)
    throw new ApiError('invalid-response', '响应不符合个人事务契约')
  return result.data
}
async function command(path: string, json: unknown, signal?: AbortSignal) {
  await apiClient.request(path, {
    method: 'POST',
    json,
    signal,
    isBusinessFailure: (value) =>
      !z.object({ status: z.literal(1) }).safeParse(value).success,
  })
}

export function getNotices(
  page = 1,
  size = 10,
  isRead = 0,
  signal?: AbortSignal,
) {
  return read(
    z.object({ count, results: z.array(noticeSchema) }),
    `/front/user/notice/?page=${page}&size=${size}${isRead ? `&is_read=${isRead}` : ''}`,
    signal,
  )
}
// 原接口 GET 详情同时标记已读：只在用户打开详情时调用，不预取、不自动重试。
export function getNoticeDetail(itemId: ItemId, signal?: AbortSignal) {
  return read(
    noticeSchema.omit({ is_read: true }).extend({ content: z.string() }),
    `/front/user/notice/${encodeURIComponent(itemId)}/`,
    signal,
  )
}
export async function getNoticeCount(signal?: AbortSignal) {
  return (
    await read(
      z.object({ status: z.literal(1), data: count }),
      '/front/user/notice/count/',
      signal,
    )
  ).data
}
export async function readAllNotices(signal?: AbortSignal) {
  // 原调用不消费返回体；保留 HTTP 错误和显式业务失败，而不虚构必填响应字段。
  await apiClient.request('/front/user/notice/read/', {
    method: 'POST',
    signal,
    isBusinessFailure: (value) =>
      typeof value === 'object' &&
      value !== null &&
      Reflect.get(value, 'status') === 2,
  })
}
export function getTodos(signal?: AbortSignal) {
  return read(z.array(todoSchema), '/front/user/todo/?nopage=1', signal)
}
export async function getTodoCount(signal?: AbortSignal) {
  return (
    await read(
      z.object({ status: z.literal(1), data: z.object({ count }) }),
      '/front/user/todo/count/',
      signal,
    )
  ).data.count
}
export const newTodoSchema = z.object({
  content: z.string(),
  set_time: z.string(),
})
export async function addTodo(
  values: z.infer<typeof newTodoSchema>,
  signal?: AbortSignal,
) {
  const input = newTodoSchema.parse(values)
  const value = await apiClient.request('/front/user/todo/', {
    method: 'POST',
    json: { content: input.content || null, set_time: input.set_time || null },
    signal,
  })
  const parsed = z.object({ id }).safeParse(value)
  if (!parsed.success)
    throw new ApiError('invalid-response', '新建待办响应不符合契约')
  return parsed.data
}
export function changeTodo(itemId: ItemId, otype: 1 | 2, signal?: AbortSignal) {
  return command('/front/user/todo/batch/', { ids: [itemId], otype }, signal)
}
export function getCollections(page = 1, size = 21, signal?: AbortSignal) {
  return read(
    z.object({ count, results: z.array(collectionSchema) }),
    `/front/user/collect/?page=${page}&size=${size}&search=`,
    signal,
  )
}

export const activityKeys = {
  notices: ['account', 'notices', 'list'] as const,
  noticeCount: ['account', 'notices', 'count'] as const,
  todos: ['account', 'todos'] as const,
  todoCount: ['account', 'todos', 'count'] as const,
  collections: ['account', 'collections'] as const,
}
