import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { contentAddress } from './content'
const noteSchema = z.object({
  id: z.union([z.string().min(1), z.number().positive()]),
  content: z.string(),
})
export type ExperimentNote = z.infer<typeof noteSchema>
const path = (id: string | number) =>
  `/admin/simulation/experiment/${encodeURIComponent(id)}/user/note/`
export const experimentNoteKey = (
  account: string | number,
  id: string | number,
) => ['experiment-notes', String(account), String(id)] as const
export async function getExperimentNote(
  id: string | number,
  signal?: AbortSignal,
): Promise<ExperimentNote> {
  const result = noteSchema.safeParse(
    await apiClient.request(path(id), { signal }),
  )
  if (!result.success)
    throw new ApiError(
      'invalid-response',
      '笔记响应不符合 id/content 契约；空笔记协议尚未确认',
    )
  return result.data
}
export async function saveExperimentNote(
  id: string | number,
  content: string,
  signal?: AbortSignal,
) {
  await apiClient.request(path(id), {
    method: 'POST',
    json: { content },
    signal,
    isBusinessFailure: (value) =>
      !z.object({ status: z.literal(1) }).safeParse(value).success,
  })
  return getExperimentNote(id, signal)
}
export async function exportExperimentNote(
  id: string | number,
  noteId: string | number,
  signal?: AbortSignal,
) {
  const result = await apiClient.request(
    `${path(id)}${encodeURIComponent(noteId)}/export/`,
    {
      method: 'POST',
      signal,
      isBusinessFailure: (value) =>
        z.object({ status: z.literal(2) }).safeParse(value).success,
    },
  )
  const parsed = z
    .object({
      status: z.literal(1),
      data: z.object({ file_path: z.string().min(1) }),
    })
    .safeParse(result)
  if (!parsed.success)
    throw new ApiError('invalid-response', 'Word 导出响应缺少 data.file_path')
  return contentAddress(parsed.data.data.file_path)
}
// jf 原命名算法：剥离最后一个下划线段，保留原单扩展名行为。
export function contentDownloadName(path: string) {
  const [stem = '', extension] = path.split('/').at(-1)!.split('.')
  return `${stem.includes('_') ? stem.split('_').slice(0, -1).join('_') : stem}.${extension}`
}
