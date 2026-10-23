import { z } from 'zod'
import { apiClient, ApiError } from './index'

export type FileScope = 'public' | 'personal'
const entrySchema = z.object({
  id: z.union([z.string().min(1), z.number()]),
  name: z.string(),
  path: z.string(),
  is_file: z.union([z.literal(0), z.literal(1)]),
  attached: z.string().nullable(),
  size: z.number().nonnegative(),
  type: z.string(),
  altertime: z.string(),
  source_info: z.string().nullable().optional(),
  is_share: z.union([z.literal(0), z.literal(1)]).optional(),
  is_shared_file: z.boolean().optional(),
  isLink: z.boolean().optional(),
})
const personalEntrySchema = entrySchema.extend({
  is_shared_file: z
    .union([z.literal(0), z.literal(1)])
    .transform((value) => value === 1)
    .optional(),
})
export type DriveFile = z.infer<typeof entrySchema>
export const fileListKey = (
  account: string | number,
  scope: FileScope,
  path: string,
) => ['files', account, scope, path] as const

export async function getFiles(
  scope: FileScope,
  path: string,
  signal?: AbortSignal,
): Promise<DriveFile[]> {
  const endpoint =
    scope === 'public'
      ? '/front/open/resource_network_disk/'
      : '/front/learn/task/my_profile/files/'
  const result = z
    .array(scope === 'public' ? entrySchema : personalEntrySchema)
    .safeParse(
      await apiClient.request(
        `${endpoint}?parent_path=${encodeURIComponent(path)}&nopage=1`,
        { signal },
      ),
    )
  if (!result.success || result.data.some((file) => file.id === '..'))
    throw new ApiError('invalid-response', '文件列表响应不符合契约')
  return result.data
}

// 保留两域各自的原命名算法，包括其多点文件名与重复扩展名缺陷。
export function fileDownloadName(
  scope: FileScope,
  attached: string,
  displayName: string,
) {
  const name = attached.split('/').at(-1)!
  if (scope === 'personal') {
    const [stem, extension] = name.split('.')
    const clean = stem!.includes('_')
      ? stem!.split('_').slice(0, -1).join('_')
      : stem
    return `${clean}.${extension}`
  }
  const matches = name.match(/-([^-]{8})/g)
  if (!matches) return name
  const clean = name.replace(matches.at(-1)!, '')
  return displayName && clean !== displayName
    ? `${displayName}.${clean.split('.').at(-1)}`
    : clean
}

export function isOfficeFile(attached: string) {
  return [
    'doc',
    'docx',
    'wps',
    'xls',
    'xlsx',
    'et',
    'ppt',
    'pptx',
    'dps',
  ].includes(attached.split('.').at(-1)!.toLocaleLowerCase())
}

export async function exportFiles(
  scope: FileScope,
  ids: DriveFile['id'][],
  signal?: AbortSignal,
): Promise<string> {
  if (!ids.length || ids.some((id) => id === '..'))
    throw new Error('请选择有效文件')
  const endpoint =
    scope === 'public'
      ? '/front/open/resource_network_disk/'
      : '/front/learn/task/my_profile/files/'
  const response = await apiClient.request(endpoint + 'export_zip/', {
    method: 'POST',
    json: scope === 'public' ? { resource_ids: ids } : { file_ids: ids },
    signal,
  })
  const result = z
    .object({
      status: z.number(),
      message: z.string(),
      download_url: z.string().min(1),
    })
    .safeParse(response)
  if (!result.success)
    throw new ApiError('invalid-response', '打包响应不符合契约')
  if (result.data.status !== 1)
    throw new ApiError('business', result.data.message)
  const address = result.data.download_url
  if (!/^\/(?!\/)/.test(address) && !/^https?:\/\//.test(address))
    throw new ApiError('invalid-response', '打包下载地址不符合契约')
  return address
}
