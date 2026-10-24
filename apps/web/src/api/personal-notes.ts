import { z } from 'zod'
import { apiClient, ApiError } from './index'
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
