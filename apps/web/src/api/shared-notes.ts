import { z } from 'zod'
import { apiClient, ApiError } from './index'
import type { NoteContext, NoteId } from './personal-notes'
const id = z.union([z.string().min(1), z.number().finite()])
const item = z.object({ id, name: z.string() })
async function parse<T>(
  schema: z.ZodType<T>,
  path: string,
  options: Parameters<typeof apiClient.request>[1] = {},
) {
  const result = schema.safeParse(await apiClient.request(path, options))
  if (!result.success)
    throw new ApiError(
      'invalid-response',
      `共享笔记响应契约错误：${path.split('?')[0]}（${result.error.issues
        .map((i) => `${i.path.join('.')}:${i.code}`)
        .slice(0, 5)
        .join('; ')}）`,
    )
  return result.data
}
export const sharedNoteKeys = {
  list: (account: NoteId, context: NoteContext, search: string) =>
    ['shared-notes', String(account), 'list', context, search] as const,
  detail: (account: NoteId, noteId: NoteId) =>
    ['shared-notes', String(account), 'detail', String(noteId)] as const,
  score: (account: NoteId, noteId: NoteId) =>
    ['shared-notes', String(account), 'score', String(noteId)] as const,
}
export function getSharedNotes(
  context: NoteContext,
  search: string,
  signal?: AbortSignal,
) {
  if (context.type > 4) throw new Error('自定义目录不支持共享笔记')
  const query = new URLSearchParams({
    course_id: String(context.courseId),
    nopage: '1',
    search,
  })
  if (context.sectionId !== undefined)
    query.set('section_id', String(context.sectionId))
  if (context.type > 1) query.set('type', String(context.type))
  query.set('share', 'true')
  return parse(
    z.array(item),
    `/front/learn/task/my_notes/folders/${context.type}/courses/${encodeURIComponent(context.courseId)}/shared_notes/?${query}`,
    { signal },
  )
}
const sharedNote = z.object({
  id,
  content: z.string(),
  synthesis_score: z.number().finite().min(0).max(5),
  extend: z.unknown().optional(),
  section_id: id.optional(),
})
export type SharedNote = z.infer<typeof sharedNote>
const notePath = (noteId: NoteId) =>
  `/front/share/note/${encodeURIComponent(noteId)}/`
export function getSharedNote(noteId: NoteId, signal?: AbortSignal) {
  return parse(sharedNote, notePath(noteId), { signal })
}
export async function getNoteScore(noteId: NoteId, signal?: AbortSignal) {
  return (
    await parse(
      z.object({
        data: z.object({ note_score: z.number().int().min(0).max(5) }),
      }),
      `${notePath(noteId)}score/`,
      { signal },
    )
  ).data.note_score
}
export async function scoreSharedNote(
  noteId: NoteId,
  score: number,
  signal?: AbortSignal,
) {
  if (!Number.isInteger(score) || score < 1 || score > 5)
    throw new Error('请选择1至5星')
  await parse(z.object({ status: z.literal(1) }), `${notePath(noteId)}score/`, {
    method: 'POST',
    json: { note_score: score },
    signal,
    isBusinessFailure: (value) =>
      z.object({ status: z.literal(2) }).safeParse(value).success,
  })
}
export async function sharePersonalNote(
  noteId: NoteId,
  share: boolean,
  content: string,
  signal?: AbortSignal,
) {
  await parse(
    z.object({ id }),
    `/front/user/note/${encodeURIComponent(noteId)}/`,
    {
      method: 'PATCH',
      json: { share, ...(content ? { content } : {}) },
      signal,
      isBusinessFailure: (value) =>
        z.object({ status: z.literal(2) }).safeParse(value).success,
    },
  )
}
