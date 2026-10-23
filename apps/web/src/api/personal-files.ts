import { z } from 'zod'
import { apiClient } from './index'
import type { DriveFile } from './files'

export const fileNameSchema = z.object({
  name: z.string().min(1, '请输入名称').max(50, '名称最多 50 个字符'),
})
export function cleanFileName(value: string) {
  return value.replace(/[/\\"<>?:*]/g, '').trim()
}
function validName(value: string) {
  return fileNameSchema.parse({ name: cleanFileName(value) }).name
}
const base = '/front/learn/task/my_profile/files/'
async function command(
  path: string,
  method: 'POST' | 'PUT',
  json: unknown,
  signal?: AbortSignal,
) {
  await apiClient.request(base + path, { method, json, signal })
}
export async function createFileFolder(
  name: string,
  path: string,
  signal?: AbortSignal,
) {
  await command(
    'folder/',
    'POST',
    { name: validName(name), parent_path: path },
    signal,
  )
}
export async function renamePersonalFile(
  fileId: DriveFile['id'],
  name: string,
  signal?: AbortSignal,
) {
  await command(
    `${encodeURIComponent(fileId)}/rename/`,
    'PUT',
    { name: validName(name) },
    signal,
  )
}
export async function deletePersonalFiles(
  fileIds: DriveFile['id'][],
  signal?: AbortSignal,
) {
  if (!fileIds.length || fileIds.some((id) => id === '..'))
    throw new Error('请选择有效文件')
  await command('batch-delete/', 'POST', { id: fileIds }, signal)
}
export async function sharePersonalFile(
  fileId: DriveFile['id'],
  shared: boolean,
  signal?: AbortSignal,
) {
  await command(
    `${encodeURIComponent(fileId)}/share/`,
    'PUT',
    { is_share: shared },
    signal,
  )
}
