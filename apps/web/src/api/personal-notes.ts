import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { contentAddress } from './content'
const idSchema = z.union([z.string().min(1), z.number().finite()])
export type NoteId = z.infer<typeof idSchema>
const folderSchema = z.object({
  id: idSchema,
  name: z.string(),
  type: z.number().int().positive(),
  courses: z.array(z.object({ id: idSchema, name: z.string() })),
})
export type NoteFolder = z.infer<typeof folderSchema>
export type NoteContext = {
  folderId: NoteId
  courseId: NoteId
  type: number
  sectionId?: NoteId
}
export const personalNoteKeys = {
  folders: (account: NoteId, search: string) =>
    ['personal-notes', String(account), 'folders', search] as const,
  list: (account: NoteId, context: NoteContext, search: string) =>
    ['personal-notes', String(account), 'list', context, search] as const,
  detail: (account: NoteId, id: NoteId) =>
    ['personal-notes', String(account), 'detail', String(id)] as const,
}
async function parse<T>(
  schema: z.ZodType<T>,
  path: string,
  options: Parameters<typeof apiClient.request>[1] = {},
) {
  const result = schema.safeParse(await apiClient.request(path, options))
  if (!result.success)
    throw new ApiError(
      'invalid-response',
      `笔记响应契约错误：${path.split('?')[0]}（${result.error.issues
        .map((i) => `${i.path.join('.')}:${i.code}`)
        .slice(0, 5)
        .join('; ')}）`,
    )
  return result.data
}
export function getNoteFolders(search: string, signal?: AbortSignal) {
  return parse(
    z.array(folderSchema),
    `/front/learn/task/my_notes/folders/?${new URLSearchParams({ nopage: '1', search })}`,
    { signal },
  )
}
const personalNoteSchema = z.object({
  id: idSchema,
  name: z.string(),
  content: z.string(),
  share: z.boolean(),
  extend: z.unknown().optional(),
  section_id: idSchema.optional(),
})
export type PersonalNote = z.infer<typeof personalNoteSchema>
export function getPersonalNote(id: NoteId, signal?: AbortSignal) {
  return parse(
    personalNoteSchema,
    `/front/user/note/${encodeURIComponent(id)}/`,
    { signal },
  )
}
export function personalNotesPath(context: NoteContext) {
  const folder = context.type > 4 ? context.folderId : context.type
  const course = context.type > 4 ? 0 : context.courseId
  return `/front/learn/task/my_notes/folders/${encodeURIComponent(folder)}/courses/${encodeURIComponent(course)}/notes/`
}
export function getPersonalNotes(
  context: NoteContext,
  search: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ nopage: '1', search })
  if (context.sectionId !== undefined)
    query.set('section_id', String(context.sectionId))
  if ([2, 3, 4].includes(context.type)) {
    query.set('course_id', String(context.courseId))
    query.set('type', String(context.type))
  }
  return parse(
    z.array(z.object({ id: idSchema, name: z.string() })),
    `${personalNotesPath(context)}?${query}`,
    { signal },
  )
}
export const noteNameSchema = z.object({
  name: z.string().min(1, '请输入名称').max(50, '名称最多50个字符'),
})
const businessFailure = (value: unknown) =>
  z.object({ status: z.literal(2) }).safeParse(value).success
export function saveNoteFolder(
  name: string,
  id?: NoteId,
  signal?: AbortSignal,
) {
  noteNameSchema.parse({ name })
  return parse(
    z.object({ id: idSchema }),
    `/front/learn/task/my_notes/folders/${id === undefined ? 'create' : `${encodeURIComponent(id)}/rename`}/`,
    {
      method: 'POST',
      json: id === undefined ? { name } : { id, name },
      signal,
      isBusinessFailure: businessFailure,
    },
  )
}
export async function deleteNoteFolder(id: NoteId, signal?: AbortSignal) {
  await parse(
    z.object({ id: idSchema }),
    `/front/learn/task/my_notes/folders/${encodeURIComponent(id)}/delete/`,
    { method: 'POST', signal, isBusinessFailure: businessFailure },
  )
}
export function saveNoteMetadata(
  context: NoteContext,
  name: string,
  existing?: PersonalNote,
  signal?: AbortSignal,
) {
  noteNameSchema.parse({ name })
  const metadata: Record<string, unknown> = {
    name,
    share: existing ? existing.share : false,
  }
  if (existing) {
    if (Object.hasOwn(existing, 'extend')) metadata.extend = existing.extend
  } else metadata.extend = { breakpoint_time: '' }
  if ([2, 3, 4].includes(context.type)) {
    metadata.course_id = context.courseId
    metadata.type = context.type
  }
  if (context.type === 1) metadata.type = context.type
  return parse(
    z.object({ id: idSchema }),
    `${personalNotesPath(context)}${existing ? `${encodeURIComponent(existing.id)}/` : ''}`,
    {
      method: existing ? 'PATCH' : 'POST',
      json: metadata,
      signal,
      isBusinessFailure: businessFailure,
    },
  )
}
export async function savePersonalNote(
  id: NoteId,
  content: string,
  signal?: AbortSignal,
) {
  await parse(
    z.object({ id: idSchema }),
    `/front/user/note/${encodeURIComponent(id)}/`,
    {
      method: 'PATCH',
      json: { content },
      signal,
      isBusinessFailure: businessFailure,
    },
  )
  return getPersonalNote(id, signal)
}
export async function deletePersonalNote(id: NoteId, signal?: AbortSignal) {
  await apiClient.request('/front/user/note/delete/', {
    method: 'POST',
    json: { ids: [id] },
    signal,
    isBusinessFailure: (value) =>
      !z.object({ status: z.literal(1) }).safeParse(value).success,
  })
}
export async function exportPersonalNote(id: NoteId, signal?: AbortSignal) {
  const result = await parse(
    z.object({
      status: z.literal(1),
      data: z.object({ file_path: z.string().min(1) }),
    }),
    `/front/user/note/${encodeURIComponent(id)}/export/`,
    { method: 'POST', signal, isBusinessFailure: businessFailure },
  )
  return contentAddress(result.data.file_path)
}
export async function canEnterNoteCourse(id: NoteId, signal?: AbortSignal) {
  const result = await parse(
    z.object({ can_enter: z.boolean() }),
    `/front/learn/task/self_study/open_courses/${encodeURIComponent(id)}/can_enter/`,
    { signal },
  )
  return result.can_enter
}
